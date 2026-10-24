#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "display_config.h"

typedef enum {
    MONITOR_CONNECTION_STARTING = 0,
    MONITOR_CONNECTION_WIFI_CONNECTING,
    MONITOR_CONNECTION_HUB_CONNECTING,
    MONITOR_CONNECTION_ONLINE,
    MONITOR_CONNECTION_RECONNECTING,
    MONITOR_CONNECTION_OFFLINE,
} monitor_connection_state_t;

typedef enum {
    MONITOR_SAMPLE_WAITING = 0,
    MONITOR_SAMPLE_MISSING,
    MONITOR_SAMPLE_VALID,
    MONITOR_SAMPLE_INVALID,
} monitor_sample_state_t;

typedef struct {
    float cpu_percent;
    float memory_percent;
    uint32_t exam_seconds;
    monitor_sample_state_t cpu_state;
    monitor_sample_state_t memory_state;
    monitor_sample_state_t exam_state;
    int64_t received_at_ms;
    monitor_connection_state_t connection;
    monitor_display_config_t display;
} monitor_telemetry_t;

void network_client_start(void);
bool network_client_poll(monitor_telemetry_t *telemetry);
void network_client_ack_config_applied(uint32_t revision);
