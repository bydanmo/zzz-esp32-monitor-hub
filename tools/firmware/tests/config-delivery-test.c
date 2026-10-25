#include <assert.h>
#include <stdio.h>

#include "config_delivery.h"

static monitor_config_message_t expect_message(const monitor_config_delivery_t *delivery,
                                               monitor_config_message_kind_t kind,
                                               uint32_t revision)
{
    monitor_config_message_t message = monitor_config_delivery_next(delivery);
    assert(message.kind == kind);
    if (kind == MONITOR_CONFIG_MESSAGE_ACK) assert(message.revision == revision);
    return message;
}

static void finish_hello(monitor_config_delivery_t *delivery)
{
    monitor_config_message_t hello = expect_message(delivery, MONITOR_CONFIG_MESSAGE_HELLO, 0);
    monitor_config_delivery_sent(delivery, hello, true);
}

static void boot_fallback_is_never_acknowledged(void)
{
    monitor_config_application_t application = {0};
    monitor_config_delivery_t delivery = {0};
    assert(!monitor_config_needs_apply(&application, false, 1));
    monitor_config_delivery_connected(&delivery);
    finish_hello(&delivery);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_NONE, 0);

    /* A real r1 must still be applied even though boot also uses r1. */
    assert(monitor_config_needs_apply(&application, true, 1));
    monitor_config_mark_applied(&application, 1);
    monitor_config_delivery_applied(&delivery, 1);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 1);
    assert(!monitor_config_needs_apply(&application, true, 1));
    assert(!monitor_config_needs_apply(&application, false, 2));
}

static void first_revision_zero_is_valid(void)
{
    monitor_config_application_t application = {0};
    assert(monitor_config_needs_apply(&application, true, 0));
    monitor_config_mark_applied(&application, 0);
    assert(!monitor_config_needs_apply(&application, true, 0));
    assert(monitor_config_needs_apply(&application, true, 1));
}

static void reconnect_replays_the_applied_revision(void)
{
    monitor_config_application_t application = {0};
    monitor_config_delivery_t delivery = {0};
    monitor_config_delivery_connected(&delivery);
    monitor_config_mark_applied(&application, 7);
    monitor_config_delivery_applied(&delivery, 7);
    finish_hello(&delivery);
    monitor_config_message_t ack = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
    monitor_config_delivery_sent(&delivery, ack, true);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_NONE, 0);

    monitor_config_delivery_disconnected(&delivery);
    monitor_config_delivery_connected(&delivery);
    assert(!monitor_config_needs_apply(&application, true, 7));
    finish_hello(&delivery);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
}

static void send_failures_preserve_order_and_retry(void)
{
    monitor_config_delivery_t delivery = {0};
    monitor_config_delivery_applied(&delivery, 7);
    monitor_config_delivery_connected(&delivery);
    monitor_config_message_t hello = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_HELLO, 0);
    monitor_config_delivery_sent(&delivery, hello, false);
    finish_hello(&delivery);
    monitor_config_message_t ack = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
    monitor_config_delivery_sent(&delivery, ack, false);
    ack = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
    monitor_config_delivery_sent(&delivery, ack, true);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_NONE, 0);
}

static void old_ack_does_not_consume_new_application(void)
{
    monitor_config_delivery_t delivery = {0};
    monitor_config_delivery_connected(&delivery);
    finish_hello(&delivery);
    monitor_config_delivery_applied(&delivery, 7);
    monitor_config_message_t old_ack = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
    monitor_config_delivery_applied(&delivery, 8);
    monitor_config_delivery_sent(&delivery, old_ack, true);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 8);
}

static void reconnect_during_hello_requires_a_new_hello(void)
{
    monitor_config_delivery_t delivery = {0};
    monitor_config_delivery_applied(&delivery, 7);
    monitor_config_delivery_connected(&delivery);
    monitor_config_message_t old_hello = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_HELLO, 0);
    monitor_config_delivery_disconnected(&delivery);
    monitor_config_delivery_connected(&delivery);
    monitor_config_delivery_sent(&delivery, old_hello, true);
    finish_hello(&delivery);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
}

static void reconnect_during_ack_preserves_the_new_session(void)
{
    monitor_config_delivery_t delivery = {0};
    monitor_config_delivery_applied(&delivery, 7);
    monitor_config_delivery_connected(&delivery);
    finish_hello(&delivery);
    monitor_config_message_t old_ack = expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
    monitor_config_delivery_disconnected(&delivery);
    monitor_config_delivery_connected(&delivery);
    monitor_config_delivery_sent(&delivery, old_ack, true);
    finish_hello(&delivery);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 7);
}

static void application_during_disconnect_waits_for_hello(void)
{
    monitor_config_delivery_t delivery = {0};
    monitor_config_delivery_connected(&delivery);
    finish_hello(&delivery);
    monitor_config_delivery_disconnected(&delivery);
    monitor_config_delivery_applied(&delivery, 8);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_NONE, 0);
    monitor_config_delivery_connected(&delivery);
    finish_hello(&delivery);
    expect_message(&delivery, MONITOR_CONFIG_MESSAGE_ACK, 8);
}

static void hub_reset_can_apply_a_lower_revision(void)
{
    monitor_config_application_t application = {0};
    monitor_config_mark_applied(&application, 8);
    assert(monitor_config_needs_apply(&application, true, 1));
    monitor_config_mark_applied(&application, 1);
    assert(!monitor_config_needs_apply(&application, true, 1));
}

int main(void)
{
    boot_fallback_is_never_acknowledged();
    first_revision_zero_is_valid();
    reconnect_replays_the_applied_revision();
    send_failures_preserve_order_and_retry();
    old_ack_does_not_consume_new_application();
    reconnect_during_hello_requires_a_new_hello();
    reconnect_during_ack_preserves_the_new_session();
    application_during_disconnect_waits_for_hello();
    hub_reset_can_apply_a_lower_revision();
    puts("Firmware configuration delivery: 9 regression scenarios passed.");
    return 0;
}
