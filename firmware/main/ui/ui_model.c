#include "ui_model.h"

#include <math.h>
#include <string.h>

#include "ui_tokens.generated.h"
#include "ui_text_zh.h"

static void apply_metric(ui_metric_model_t *target, monitor_sample_state_t state,
                         float value, int64_t received_at_ms)
{
    if (state == MONITOR_SAMPLE_VALID && isfinite(value) && value >= 0.0f) {
        target->value = (uint32_t)lroundf(value);
        target->has_value = true;
        target->state = UI_DATA_FRESH;
        target->last_update_ms = received_at_ms;
    } else if (state == MONITOR_SAMPLE_INVALID) {
        target->has_value = false;
        target->state = UI_DATA_INVALID;
    } else if (state == MONITOR_SAMPLE_MISSING) {
        target->has_value = false;
        target->state = UI_DATA_UNAVAILABLE;
    }
}

static void age_metric(ui_metric_model_t *metric, int64_t now_ms)
{
    if (!metric->has_value || metric->state == UI_DATA_INVALID) return;
    int64_t age = now_ms - metric->last_update_ms;
    if (age <= UI_FRESHNESS_FRESH_MS) {
        metric->state = UI_DATA_FRESH;
    } else if (age <= UI_FRESHNESS_STALE_MS) {
        metric->state = UI_DATA_DELAYED;
    } else {
        metric->state = UI_DATA_STALE;
    }
}

void ui_model_init(ui_model_t *model)
{
    memset(model, 0, sizeof(*model));
    model->cpu.state = UI_DATA_WAITING;
    model->memory.state = UI_DATA_WAITING;
    model->exam.state = UI_DATA_WAITING;
    model->connection = MONITOR_CONNECTION_STARTING;
}

void ui_model_apply_telemetry(ui_model_t *model, const monitor_telemetry_t *telemetry)
{
    apply_metric(&model->cpu, telemetry->cpu_state, telemetry->cpu_percent,
                 telemetry->received_at_ms);
    apply_metric(&model->memory, telemetry->memory_state, telemetry->memory_percent,
                 telemetry->received_at_ms);
    if (telemetry->exam_state == MONITOR_SAMPLE_VALID) {
        model->exam.value = telemetry->exam_seconds;
        model->exam.has_value = true;
        model->exam.state = UI_DATA_FRESH;
        model->exam.last_update_ms = telemetry->received_at_ms;
        model->exam_anchor_seconds = telemetry->exam_seconds;
        model->exam_anchor_ms = telemetry->received_at_ms;
    } else if (telemetry->exam_state == MONITOR_SAMPLE_INVALID) {
        model->exam.has_value = false;
        model->exam.state = UI_DATA_INVALID;
    } else if (telemetry->exam_state == MONITOR_SAMPLE_MISSING) {
        model->exam.has_value = false;
        model->exam.state = UI_DATA_UNAVAILABLE;
    }
    model->connection = telemetry->connection;
    model->study = telemetry->study;
    model->study_action = telemetry->study_action;
    model->study_clock = model->study.stopwatch ? model->study.elapsed : model->study.remaining;
}

void ui_model_tick(ui_model_t *model, int64_t now_ms)
{
    int64_t age = now_ms - model->study.received_at_ms;
    model->study_stale = age > 5000 || model->connection != MONITOR_CONNECTION_ONLINE;
    uint32_t seconds = (uint32_t)(age > 5000 ? 5 : age > 0 ? age / 1000 : 0);
    if (!model->study.online || model->study.status != STUDY_RUNNING) seconds = 0;
    model->study_clock = model->study.stopwatch ? model->study.elapsed + seconds :
        model->study.remaining > seconds ? model->study.remaining - seconds : 0;
    age_metric(&model->cpu, now_ms);
    age_metric(&model->memory, now_ms);
    age_metric(&model->exam, now_ms);
    if (model->exam.has_value) {
        model->exam.value = ui_model_countdown_seconds(model, now_ms);
    }
}

uint32_t ui_model_countdown_seconds(const ui_model_t *model, int64_t now_ms)
{
    if (!model->exam.has_value) return 0;
    int64_t elapsed_ms = now_ms - model->exam_anchor_ms;
    if (elapsed_ms <= 0) return model->exam_anchor_seconds;
    uint64_t elapsed_seconds = (uint64_t)elapsed_ms / 1000u;
    return elapsed_seconds >= model->exam_anchor_seconds
        ? 0u
        : model->exam_anchor_seconds - (uint32_t)elapsed_seconds;
}

const char *ui_model_connection_text(monitor_connection_state_t connection)
{
    switch (connection) {
        case MONITOR_CONNECTION_WIFI_CONNECTING: return UI_TEXT_WIFI_CONNECTING;
        case MONITOR_CONNECTION_HUB_CONNECTING: return UI_TEXT_HUB_CONNECTING;
        case MONITOR_CONNECTION_ONLINE: return UI_TEXT_HUB_ONLINE;
        case MONITOR_CONNECTION_RECONNECTING: return UI_TEXT_HUB_RECONNECTING;
        case MONITOR_CONNECTION_OFFLINE: return UI_TEXT_HUB_OFFLINE;
        default: return UI_TEXT_STARTING;
    }
}

const char *ui_model_data_text(ui_data_state_t state)
{
    switch (state) {
        case UI_DATA_FRESH: return UI_TEXT_UPDATED_NOW;
        case UI_DATA_DELAYED: return UI_TEXT_DATA_DELAYED;
        case UI_DATA_STALE: return UI_TEXT_DATA_STALE;
        case UI_DATA_UNAVAILABLE: return UI_TEXT_UNAVAILABLE;
        case UI_DATA_INVALID: return UI_TEXT_DATA_INVALID;
        default: return UI_TEXT_WAITING_FOR_DATA;
    }
}
