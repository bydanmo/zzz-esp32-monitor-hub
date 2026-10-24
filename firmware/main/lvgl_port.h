#pragma once

#include <stdint.h>

void monitor_lvgl_init(void);
void monitor_lvgl_run(void);
int64_t monitor_lvgl_last_touch_us(void);
void monitor_lvgl_force_redraw(void);
