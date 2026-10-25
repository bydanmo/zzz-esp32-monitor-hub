#pragma once

#include <stdbool.h>
#include <stdint.h>

/* Pure state transitions shared with the native regression tests. The caller
 * must hold its state lock whenever a delivery state is read or changed. */
typedef struct {
    bool applied;
    uint32_t revision;
} monitor_config_application_t;

typedef enum {
    MONITOR_CONFIG_MESSAGE_NONE = 0,
    MONITOR_CONFIG_MESSAGE_HELLO,
    MONITOR_CONFIG_MESSAGE_ACK,
} monitor_config_message_kind_t;

typedef struct {
    monitor_config_message_kind_t kind;
    uint32_t generation;
    uint32_t revision;
} monitor_config_message_t;

typedef struct {
    monitor_config_application_t application;
    uint32_t generation;
    bool connected;
    bool hello_pending;
    bool ack_pending;
} monitor_config_delivery_t;

bool monitor_config_needs_apply(const monitor_config_application_t *application,
                                bool received_valid_config, uint32_t revision);
void monitor_config_mark_applied(monitor_config_application_t *application,
                                 uint32_t revision);
void monitor_config_delivery_connected(monitor_config_delivery_t *delivery);
void monitor_config_delivery_disconnected(monitor_config_delivery_t *delivery);
void monitor_config_delivery_applied(monitor_config_delivery_t *delivery,
                                     uint32_t revision);
monitor_config_message_t monitor_config_delivery_next(const monitor_config_delivery_t *delivery);
void monitor_config_delivery_sent(monitor_config_delivery_t *delivery,
                                  monitor_config_message_t message, bool succeeded);
