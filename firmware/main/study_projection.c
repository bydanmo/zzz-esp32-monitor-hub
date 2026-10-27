#include "study_projection.h"
#include "cJSON.h"
#include <math.h>
#include <string.h>

static const cJSON *field(const cJSON *o, const char *name) { return cJSON_GetObjectItemCaseSensitive(o, name); }
static bool number(const cJSON *o, const char *name, uint32_t max, uint32_t *out)
{
    const cJSON *v = field(o, name);
    if (!cJSON_IsNumber(v) || !isfinite(v->valuedouble) || v->valuedouble < 0 ||
        v->valuedouble > max || floor(v->valuedouble) != v->valuedouble) return false;
    *out = (uint32_t)v->valuedouble; return true;
}
static bool string(const cJSON *o, const char *name, char *out, size_t size)
{
    const cJSON *v = field(o, name);
    if (!cJSON_IsString(v) || strlen(v->valuestring) >= size) return false;
    memcpy(out, v->valuestring, strlen(v->valuestring) + 1); return true;
}
bool study_projection_receive(study_receiver_t *r, const cJSON *json, int64_t now, study_projection_t *out)
{
    uint32_t version;
    if (!number(json, "version", 1, &version) || version != 1) return false;
    const cJSON *type = field(json, "type");
    if (!cJSON_IsString(type)) return false;
    if (strcmp(type->valuestring, "study") == 0) {
        /* A malformed replacement header invalidates the incomplete prior batch. */
        r->receiving = false;
        study_projection_t next = {0};
        uint32_t total, completed, page, pages, rows;
        const cJSON *online = field(json, "online"), *focus = field(json, "focus");
        char status[12], phase[10], mode[12];
        if (!cJSON_IsBool(online) || !string(json, "batch", next.batch, sizeof(next.batch)) || !next.batch[0] ||
            !string(json, "date", next.date, sizeof(next.date)) ||
            !number(json, "total", 1000, &total) || !number(json, "completed", total, &completed) ||
            !number(json, "page", 333, &page) || !number(json, "pages", 334, &pages) || pages < 1 || page >= pages ||
            !number(json, "rows", 3, &rows) || !number(focus, "revision", UINT32_MAX, &next.revision) ||
            !number(focus, "elapsed", UINT32_MAX, &next.elapsed) || !number(focus, "remaining", UINT32_MAX, &next.remaining) ||
            !string(focus, "status", status, sizeof(status)) || !string(focus, "phase", phase, sizeof(phase)) ||
            !string(focus, "mode", mode, sizeof(mode)) || !string(focus, "title", next.title, sizeof(next.title))) return false;
        if (field(focus, "session_id") && !string(focus, "session_id", next.session_id, sizeof(next.session_id))) return false;
        if (strcmp(status, "idle") == 0) next.status = STUDY_IDLE;
        else if (strcmp(status, "running") == 0) next.status = STUDY_RUNNING;
        else if (strcmp(status, "paused") == 0) next.status = STUDY_PAUSED;
        else if (strcmp(status, "ready") == 0) next.status = STUDY_READY;
        else return false;
        if (strcmp(phase, "focus") != 0 && strcmp(phase, "break") != 0) return false;
        if (strcmp(mode, "pomodoro") != 0 && strcmp(mode, "stopwatch") != 0) return false;
        next.is_break = strcmp(phase, "break") == 0; next.stopwatch = strcmp(mode, "stopwatch") == 0;
        const cJSON *enabled = field(json, "enabled");
        const cJSON *controls = field(json, "controls");
        if (controls && !cJSON_IsBool(controls)) return false;
        next.controls = cJSON_IsTrue(controls);
        if (enabled && !cJSON_IsBool(enabled)) return false;
        next.available = !cJSON_IsFalse(enabled); next.online = cJSON_IsTrue(online);
        if (!next.available && next.online) return false;
        if ((!next.online && rows != 0) || (next.online && strlen(next.date) != 10) ||
            rows != (total > page * 3 ? (total - page * 3 > 3 ? 3 : total - page * 3) : 0)) return false;
        next.total = total; next.completed = completed; next.page = page; next.pages = pages; next.rows = rows;
        next.received_at_ms = now;
        r->pending = next; r->mask = 0; r->receiving = rows != 0;
        if (!rows) { *out = next; return true; }
        return false;
    }
    if (strcmp(type->valuestring, "studyTask") != 0 || !r->receiving) return false;
    char batch[40]; uint32_t row; study_task_t task = {0};
    const cJSON *done = field(json, "done");
    if (!string(json, "batch", batch, sizeof(batch)) || strcmp(batch, r->pending.batch) != 0 ||
        !number(json, "row", r->pending.rows - 1, &row) || !number(json, "id", UINT32_MAX, &task.id) ||
        !number(json, "minutes", UINT32_MAX, &task.minutes) || !cJSON_IsBool(done) ||
        !string(json, "title", task.title, sizeof(task.title))) return false;
    task.done = cJSON_IsTrue(done); r->pending.tasks[row] = task; r->mask |= 1u << row;
    if (r->mask != (1u << r->pending.rows) - 1u) return false;
    r->pending.received_at_ms = now; *out = r->pending; r->receiving = false; return true;
}
