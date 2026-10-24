#pragma once
#include "lvgl.h"

typedef enum { UI_ART_TICKET, UI_ART_CASSETTE, UI_ART_GRILLE } ui_art_kind_t;
lv_obj_t *ui_art_create(lv_obj_t *parent, ui_art_kind_t kind, int x, int y,
                        int width, int height, uint32_t signal);
