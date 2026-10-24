#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

esp_err_t video_player_init(void);
bool video_player_is_available(void);
bool video_player_storage_mounted(void);
esp_err_t video_player_start(int64_t now_us);
esp_err_t video_player_step(int64_t now_us);
void video_player_stop(void);
bool video_player_is_active(void);

