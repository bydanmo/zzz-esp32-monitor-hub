#pragma once

#include <stdbool.h>

#include "lvgl.h"

void ui_motion_prepare_bar(lv_obj_t *bar);
void ui_motion_set_bar_activity(lv_obj_t *bar, bool enabled);
void ui_motion_set_bar(lv_obj_t *bar, int value, bool animate);
void ui_motion_set_arc(lv_obj_t *arc, int value, bool animate);
void ui_motion_set_bg_opa(lv_obj_t *object, lv_opa_t target, uint32_t duration_ms);
void ui_motion_cancel(lv_obj_t *object);
bool ui_motion_is_reduced(void);
void ui_motion_set_reduced(bool reduced);
void ui_motion_enter(lv_obj_t *object);
void ui_motion_print(lv_obj_t *object);
