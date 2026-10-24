#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "display_config.h"
#include "network_client.h"

typedef enum {
    UI_DATA_WAITING = 0,
    UI_DATA_FRESH,
    UI_DATA_DELAYED,
    UI_DATA_STALE,
    UI_DATA_UNAVAILABLE,
    UI_DATA_INVALID,
} ui_data_state_t;

typedef struct {
    uint32_t value;
    bool has_value;
    ui_data_state_t state;
    int64_t last_update_ms;
} ui_metric_model_t;

typedef struct {
    ui_metric_model_t cpu;
    ui_metric_model_t memory;
    ui_metric_model_t exam;
    uint32_t exam_anchor_seconds;
    int64_t exam_anchor_ms;
    monitor_connection_state_t connection;
} ui_model_t;

void ui_model_init(ui_model_t *model);
void ui_model_apply_telemetry(ui_model_t *model, const monitor_telemetry_t *telemetry);
void ui_model_tick(ui_model_t *model, int64_t now_ms);
uint32_t ui_model_countdown_seconds(const ui_model_t *model, int64_t now_ms);
const char *ui_model_connection_text(monitor_connection_state_t connection);
const char *ui_model_data_text(ui_data_state_t state);
