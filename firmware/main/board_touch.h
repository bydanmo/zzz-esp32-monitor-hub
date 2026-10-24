#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint16_t x;
    uint16_t y;
} board_touch_point_t;

void board_touch_init(void);
bool board_touch_read(board_touch_point_t *point);
