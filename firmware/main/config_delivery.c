#include "config_delivery.h"

bool monitor_config_needs_apply(const monitor_config_application_t *application,
                                bool received_valid_config, uint32_t revision)
{
    return received_valid_config &&
        (!application->applied || application->revision != revision);
}

void monitor_config_mark_applied(monitor_config_application_t *application,
                                 uint32_t revision)
{
    application->applied = true;
    application->revision = revision;
}

void monitor_config_delivery_connected(monitor_config_delivery_t *delivery)
{
    delivery->generation++;
    delivery->connected = true;
    delivery->hello_pending = true;
    delivery->ack_pending = delivery->application.applied;
}

void monitor_config_delivery_disconnected(monitor_config_delivery_t *delivery)
{
    delivery->generation++;
    delivery->connected = false;
}

void monitor_config_delivery_applied(monitor_config_delivery_t *delivery,
                                     uint32_t revision)
{
    monitor_config_mark_applied(&delivery->application, revision);
    delivery->ack_pending = true;
}

monitor_config_message_t monitor_config_delivery_next(const monitor_config_delivery_t *delivery)
{
    monitor_config_message_t message = {
        .generation = delivery->generation,
        .revision = delivery->application.revision,
    };
    if (!delivery->connected) return message;
    if (delivery->hello_pending) message.kind = MONITOR_CONFIG_MESSAGE_HELLO;
    else if (delivery->ack_pending) message.kind = MONITOR_CONFIG_MESSAGE_ACK;
    return message;
}

void monitor_config_delivery_sent(monitor_config_delivery_t *delivery,
                                  monitor_config_message_t message, bool succeeded)
{
    /* Network callbacks can reconnect while send_text is outside the lock.
     * A completion for the old socket must not consume the new hello/ACK. */
    if (!succeeded || !delivery->connected || message.generation != delivery->generation) return;
    if (message.kind == MONITOR_CONFIG_MESSAGE_HELLO) {
        delivery->hello_pending = false;
    } else if (message.kind == MONITOR_CONFIG_MESSAGE_ACK &&
               delivery->application.applied &&
               message.revision == delivery->application.revision) {
        delivery->ack_pending = false;
    }
}
