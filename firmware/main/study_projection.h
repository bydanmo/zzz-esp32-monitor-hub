#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef struct cJSON cJSON;

typedef enum { STUDY_IDLE, STUDY_RUNNING, STUDY_PAUSED, STUDY_READY } study_status_t;
typedef struct { uint32_t id; bool done; uint32_t minutes; char title[257]; } study_task_t;
typedef struct {
    bool available;
    bool online;
    bool controls;
    char batch[40];
    char date[11];
    uint16_t total, completed, page, pages;
    uint8_t rows;
    uint32_t revision, elapsed, remaining;
    char session_id[37];
    study_status_t status;
    bool is_break, stopwatch;
    char title[129];
    study_task_t tasks[3];
    int64_t received_at_ms;
} study_projection_t;
typedef struct { study_projection_t pending; uint8_t mask; bool receiving; } study_receiver_t;

/* Commit only a complete header + matching rows, never a half-updated page. */
bool study_projection_receive(study_receiver_t *receiver, const cJSON *json,
                              int64_t now_ms, study_projection_t *out);
