#include "device_settings.h"

#define SETTINGS_VERSION 0xA5010000u
#define SETTINGS_ALLOWED 0x000003FFu
static device_settings_t current;
static uint32_t saved;
static bool persisted;

static uint32_t encode(void)
{
    return SETTINGS_VERSION | current.brightness | (current.reduced_motion ? 0x100u : 0) |
           (current.screensaver ? 0x200u : 0);
}

void device_settings_init(void)
{
    uint32_t value=0;
    current=(device_settings_t){100,false,true};
    persisted=false;
    if (device_settings_storage_load(&value) && (value & ~SETTINGS_ALLOWED)==SETTINGS_VERSION &&
        (value & 255u)>=DEVICE_BRIGHTNESS_MIN && (value & 255u)<=DEVICE_BRIGHTNESS_MAX) {
        current=(device_settings_t){value & 255u, (value & 0x100u)!=0, (value & 0x200u)!=0};
        persisted=true;
    }
    saved=encode();
    device_settings_apply(current.brightness,current.reduced_motion);
}

const device_settings_t *device_settings_get(void) { return &current; }
bool device_settings_dirty(void) { return !persisted || encode()!=saved; }

void device_settings_preview_brightness(int percent)
{
    if (percent<DEVICE_BRIGHTNESS_MIN) percent=DEVICE_BRIGHTNESS_MIN;
    if (percent>DEVICE_BRIGHTNESS_MAX) percent=DEVICE_BRIGHTNESS_MAX;
    current.brightness=(uint8_t)percent;
    device_settings_apply(current.brightness,current.reduced_motion);
}

void device_settings_set_reduced_motion(bool enabled)
{
    current.reduced_motion=enabled;
    device_settings_apply(current.brightness,current.reduced_motion);
}

void device_settings_set_screensaver(bool enabled) { current.screensaver=enabled; }

bool device_settings_save(void)
{
    uint32_t value=encode();
    if (persisted && value==saved) return true;
    if (!device_settings_storage_save(value)) return false;
    saved=value;
    persisted=true;
    return true;
}
