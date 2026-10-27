#include <assert.h>
#include <stdio.h>
#include "study_projection.h"
#include "cJSON.h"
static bool receive(study_receiver_t *r, const char *text, study_projection_t *out) {
    cJSON *json = cJSON_Parse(text); assert(json);
    bool complete = study_projection_receive(r, json, 1234, out); cJSON_Delete(json); return complete;
}
int main(void) {
    study_receiver_t r = {0}; study_projection_t out = {0};
    const char *header = "{\"type\":\"study\",\"version\":1,\"batch\":\"a-1\",\"online\":true,\"date\":\"2026-10-26\",\"total\":2,\"completed\":0,\"page\":0,\"pages\":1,\"rows\":2,\"focus\":{\"revision\":2,\"status\":\"paused\",\"phase\":\"focus\",\"mode\":\"pomodoro\",\"elapsed\":30,\"remaining\":1470,\"title\":\"函数与极限\"}}";
    assert(!receive(&r, header, &out)); assert(!out.available);
    assert(!receive(&r, "{\"type\":\"studyTask\",\"version\":1,\"batch\":\"wrong\",\"row\":0,\"id\":4,\"title\":\"错误批次\",\"done\":false,\"minutes\":30}", &out));
    assert(!receive(&r, "{\"type\":\"studyTask\",\"version\":1,\"batch\":\"a-1\",\"row\":1,\"id\":5,\"title\":\"英语阅读\",\"done\":true,\"minutes\":30}", &out));
    assert(receive(&r, "{\"type\":\"studyTask\",\"version\":1,\"batch\":\"a-1\",\"row\":0,\"id\":4,\"title\":\"函数与极限\",\"done\":false,\"minutes\":30}", &out));
    assert(out.available && out.online && out.tasks[1].id == 5 && out.status == STUDY_PAUSED);
    assert(!receive(&r, "{\"type\":\"studyTask\",\"version\":1,\"batch\":\"a-1\",\"row\":0,\"id\":4,\"title\":\"重复\",\"done\":false,\"minutes\":30}", &out));
    assert(!receive(&r, "{\"type\":\"study\",\"version\":1,\"batch\":\"bad\"}", &out));
    assert(out.tasks[0].id == 4);
    assert(receive(&r, "{\"type\":\"study\",\"version\":1,\"batch\":\"off\",\"enabled\":false,\"online\":false,\"date\":\"\",\"total\":0,\"completed\":0,\"page\":0,\"pages\":1,\"rows\":0,\"focus\":{\"revision\":0,\"status\":\"idle\",\"phase\":\"focus\",\"mode\":\"pomodoro\",\"elapsed\":0,\"remaining\":0,\"title\":\"\"}}", &out));
    assert(!out.available && !out.online && out.rows == 0);
    puts("study projection transaction, row ordering, duplicate and invalid frame checks passed");
}
