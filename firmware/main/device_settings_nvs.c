#include "device_settings.h"
#include "board_display.h"
#include "ui/ui_motion.h"
#include "esp_log.h"
#include "nvs.h"
#include "animation_preferences.h"

static const char *TAG="local-settings";

bool device_settings_storage_load(uint32_t *value)
{
    nvs_handle_t handle;
    esp_err_t result=nvs_open("local_display",NVS_READONLY,&handle);
    if (result!=ESP_OK) {
        if (result!=ESP_ERR_NVS_NOT_FOUND) ESP_LOGW(TAG,"Settings read unavailable: %s",esp_err_to_name(result));
        return false;
    }
    result=nvs_get_u32(handle,"options",value);
    nvs_close(handle);
    if (result!=ESP_OK && result!=ESP_ERR_NVS_NOT_FOUND) ESP_LOGW(TAG,"Settings read failed: %s",esp_err_to_name(result));
    return result==ESP_OK;
}

bool device_settings_storage_save(uint32_t value)
{
    nvs_handle_t handle;
    esp_err_t result=nvs_open("local_display",NVS_READWRITE,&handle);
    if (result==ESP_OK) {
        result=nvs_set_u32(handle,"options",value);
        if (result==ESP_OK) result=nvs_commit(handle);
        nvs_close(handle);
    }
    if (result!=ESP_OK) ESP_LOGW(TAG,"Settings save failed: %s",esp_err_to_name(result));
    else ESP_LOGI(TAG,"Saved brightness=%u%% reduced=%d screensaver=%d",(unsigned)(value & 255u),!!(value & 0x100u),!!(value & 0x200u));
    return result==ESP_OK;
}

void device_settings_apply(uint8_t brightness, bool reduced_motion)
{
    board_display_set_brightness(brightness);
    ui_motion_set_reduced(reduced_motion);
}

bool animation_preferences_storage_load(uint8_t value[ANIMATION_PREFERENCES_BYTES])
{
    nvs_handle_t handle;size_t length=ANIMATION_PREFERENCES_BYTES;
    if(nvs_open("local_display",NVS_READONLY,&handle)!=ESP_OK) return false;
    esp_err_t result=nvs_get_blob(handle,"animation",value,&length);nvs_close(handle);
    return result==ESP_OK && length==ANIMATION_PREFERENCES_BYTES;
}
bool animation_preferences_storage_save(const uint8_t value[ANIMATION_PREFERENCES_BYTES])
{
    nvs_handle_t handle;esp_err_t result=nvs_open("local_display",NVS_READWRITE,&handle);
    if(result==ESP_OK) {
        result=nvs_set_blob(handle,"animation",value,ANIMATION_PREFERENCES_BYTES);
        if(result==ESP_OK) result=nvs_commit(handle);
        nvs_close(handle);
    }
    if(result!=ESP_OK) ESP_LOGW(TAG,"Animation selection save failed: %s",esp_err_to_name(result));
    return result==ESP_OK;
}
