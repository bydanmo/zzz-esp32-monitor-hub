#include "device_settings.h"
#include "board_display.h"
#include "ui/ui_motion.h"
#include "esp_log.h"
#include "nvs.h"

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
