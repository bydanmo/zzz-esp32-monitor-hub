#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "board_config.h"
#include "board_display.h"
#include "board_touch.h"
#include "dashboard.h"
#include "lvgl_port.h"
#include "network_client.h"
#include "config_delivery.h"
#include "ui/ui_model.h"
#include "video_player.h"
#include "media_assets.h"

static const char *TAG = "esp32-monitor";

#define DASHBOARD_PHASE_US (5LL * 60 * 1000000)
#define VIDEO_PHASE_US (5LL * 60 * 1000000)

typedef enum {
    DISPLAY_MODE_DASHBOARD,
    DISPLAY_MODE_VIDEO,
} display_mode_t;

void app_main(void)
{
    ESP_LOGI(TAG, "ESP32 Monitor firmware started for %dx%d display",
             BOARD_LCD_WIDTH, BOARD_LCD_HEIGHT);
    board_display_init();
    board_touch_init();
    monitor_lvgl_init();
    dashboard_create();
    network_client_start();
    esp_err_t video_result = video_player_init();
    if (video_result != ESP_OK) {
        ESP_LOGW(TAG, "Video screensaver unavailable: %s",
                 esp_err_to_name(video_result));
    }
    ESP_LOGI(TAG, "ST7796S, FT6336U and LVGL dashboard initialized");
    monitor_config_application_t applied_config = {0};
    int64_t last_ui_update_ms = 0;
    ui_model_t ui_model;
    ui_model_init(&ui_model);
    display_mode_t display_mode = DISPLAY_MODE_DASHBOARD;
    int64_t mode_started_us = esp_timer_get_time();
    int64_t observed_touch_us = monitor_lvgl_last_touch_us();
    int64_t next_phase_log_us = mode_started_us + 60000000LL;
    bool sync_wait_logged=false;

    while (true) {
        monitor_telemetry_t telemetry;
        if (network_client_poll(&telemetry)) {
            ui_model_apply_telemetry(&ui_model, &telemetry);
            if (monitor_config_needs_apply(&applied_config, telemetry.display_valid,
                                            telemetry.display.revision)) {
                dashboard_apply_config(&telemetry.display);
                monitor_config_mark_applied(&applied_config, telemetry.display.revision);
                network_client_ack_config_applied(applied_config.revision);
            }
        }
        int64_t now_ms = esp_timer_get_time() / 1000;
        int64_t now_us = now_ms * 1000;
        ui_model_tick(&ui_model, now_ms);
        media_assets_sync(ui_model.connection==MONITOR_CONNECTION_ONLINE && display_mode==DISPLAY_MODE_DASHBOARD,
                          video_player_storage_mounted());

        if (display_mode == DISPLAY_MODE_DASHBOARD) {
            int64_t touch_us = monitor_lvgl_last_touch_us();
            if (touch_us != observed_touch_us) {
                observed_touch_us = touch_us;
                mode_started_us = touch_us;
            }
            if (now_ms - last_ui_update_ms >= 100) {
                dashboard_update(&ui_model);
                last_ui_update_ms = now_ms;
            }
            monitor_lvgl_run();

            if (now_us >= next_phase_log_us) {
                ESP_LOGI(TAG, "Dashboard idle %lld/300s, video available=%s, media sync=%s",
                         (long long)((now_us-mode_started_us)/1000000LL),
                         video_player_is_available() ? "yes" : "no",
                         media_assets_busy()?"busy":media_assets_ready()?"ready":"pending");
                next_phase_log_us = now_us + 60000000LL;
            }

            if (now_us - mode_started_us >= DASHBOARD_PHASE_US) {
                if(media_assets_busy()) {
                    if(!sync_wait_logged) ESP_LOGI(TAG,"Video start deferred until media synchronization completes");
                    sync_wait_logged=true;
                } else if (video_player_start(now_us) == ESP_OK) {
                    display_mode = DISPLAY_MODE_VIDEO;
                    mode_started_us = now_us;
                    sync_wait_logged=false;
                } else {
                    /* Keep the useful dashboard visible and retry at the next
                     * five-minute boundary when the card/video is unavailable. */
                    mode_started_us = now_us;
                    ESP_LOGW(TAG, "Video phase skipped; dashboard cycle restarted");
                }
            }
        } else {
            board_touch_point_t point;
            if (board_touch_read(&point)) {
                video_player_stop();
                board_display_set_backlight(true);
                monitor_lvgl_force_redraw();
                display_mode = DISPLAY_MODE_DASHBOARD;
                mode_started_us = now_us;
                observed_touch_us = monitor_lvgl_last_touch_us();
                ESP_LOGI(TAG, "Dashboard restored by touch at %u,%u",
                         point.x, point.y);
            } else if (display_mode == DISPLAY_MODE_VIDEO) {
                if (now_us - mode_started_us >= VIDEO_PHASE_US) {
                    video_player_stop();
                    monitor_lvgl_force_redraw();
                    display_mode = DISPLAY_MODE_DASHBOARD;
                    mode_started_us = now_us;
                    ESP_LOGI(TAG, "Video phase complete; dashboard cycle restarted");
                } else if (video_player_step(now_us) != ESP_OK) {
                    video_player_stop();
                    monitor_lvgl_force_redraw();
                    display_mode = DISPLAY_MODE_DASHBOARD;
                    mode_started_us = now_us;
                    ESP_LOGW(TAG, "Video playback failed; dashboard restored");
                }
            }
        }
        // The default ESP-IDF tick period is 10 ms. A 5 ms conversion rounds
        // down to zero and starves IDLE0, eventually tripping the task WDT.
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
