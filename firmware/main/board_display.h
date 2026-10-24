#pragma once

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "esp_err.h"

void board_display_init(void);
void board_display_fill(uint16_t color);
void board_display_set_backlight(bool enabled);
esp_err_t board_display_write_rect_rgb565be(int x, int y, int width, int line_count,
                                           const uint8_t *pixels, size_t byte_count);
/* Queue borrows pixels until wait completes. Callers must not mutate them. */
esp_err_t board_display_queue_rect_rgb565be(int x, int y, int width, int line_count,
                                           const uint8_t *pixels, size_t byte_count);
esp_err_t board_display_wait(void);
esp_err_t board_display_write_rgb565be(int y, int line_count,
                                      const uint8_t *pixels, size_t byte_count);
typedef void (*board_display_flush_done_cb_t)(void *context);
void board_display_flush(int x1, int y1, int x2, int y2, const uint16_t *pixels,
                         size_t pixel_count, board_display_flush_done_cb_t done_cb,
                         void *context);
