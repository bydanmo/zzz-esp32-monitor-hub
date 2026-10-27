#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    MONITOR_PAGE_OVERVIEW = 0,
    MONITOR_PAGE_SYSTEM,
    MONITOR_PAGE_STUDY,
    MONITOR_PAGE_SETTINGS, /* Local-only page; not a Hub page command. */
    MONITOR_PAGE_COUNT,
} monitor_page_t;

typedef struct {
    uint32_t revision;
    char title[49];
    monitor_page_t page;
    uint32_t background_color;
    uint32_t card_color;
    uint32_t accent_color;
    uint32_t data_text_color;
    bool show_cpu;
    bool show_memory;
    bool show_exam;
} monitor_display_config_t;
