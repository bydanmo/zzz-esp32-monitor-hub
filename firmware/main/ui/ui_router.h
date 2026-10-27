#pragma once

#include <stdbool.h>

#include "display_config.h"

typedef struct {
    monitor_page_t active_page;
    monitor_page_t configured_page;
    bool show_cpu;
    bool show_memory;
    bool show_exam;
    bool show_study;
} ui_router_t;

void ui_router_init(ui_router_t *router, const monitor_display_config_t *config);
bool ui_router_apply_config(ui_router_t *router, const monitor_display_config_t *config,
                            bool page_command_changed);
bool ui_router_set_page(ui_router_t *router, monitor_page_t page);
bool ui_router_shift(ui_router_t *router, int direction);
bool ui_router_page_available(const ui_router_t *router, monitor_page_t page);
