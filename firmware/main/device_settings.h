#pragma once
#include <stdbool.h>
#include <stdint.h>

#define DEVICE_BRIGHTNESS_MIN 10
#define DEVICE_BRIGHTNESS_MAX 100

typedef struct {
    uint8_t brightness;
    bool reduced_motion;
    bool screensaver;
} device_settings_t;

void device_settings_init(void);
const device_settings_t *device_settings_get(void);
void device_settings_preview_brightness(int percent);
void device_settings_set_reduced_motion(bool enabled);
void device_settings_set_screensaver(bool enabled);
bool device_settings_save(void);
bool device_settings_dirty(void);

/* Platform boundary: one atomic versioned NVS value; host tests use a store fixture. */
bool device_settings_storage_load(uint32_t *value);
bool device_settings_storage_save(uint32_t value);
void device_settings_apply(uint8_t brightness, bool reduced_motion);
