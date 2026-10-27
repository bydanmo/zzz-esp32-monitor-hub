#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "display_config.h"
#include "study_projection.h"

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

typedef enum { STUDY_ACTION_NONE, STUDY_ACTION_PENDING, STUDY_ACTION_OK,
               STUDY_ACTION_CONFLICT, STUDY_ACTION_ERROR, STUDY_ACTION_UNKNOWN } study_action_state_t;

typedef struct {
    float cpu_percent;
    float memory_percent;
    uint32_t exam_seconds;
    monitor_sample_state_t cpu_state;
    monitor_sample_state_t memory_state;
    monitor_sample_state_t exam_state;
    int64_t received_at_ms;
    uint32_t clock_seconds;
    int64_t clock_received_at_ms;
    bool clock_valid;
    monitor_connection_state_t connection;
    /* The boot fallback is not a configuration received from the Hub. */
    bool display_valid;
    monitor_display_config_t display;
    study_projection_t study;
    study_action_state_t study_action;
} monitor_telemetry_t;

void network_client_start(void);
bool network_client_poll(monitor_telemetry_t *telemetry);
void network_client_ack_config_applied(uint32_t revision);
void network_client_study_page(uint16_t page);
bool network_client_study_action(const char *action, uint32_t task_id, const char *batch);
