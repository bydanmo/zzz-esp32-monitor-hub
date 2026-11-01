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
#include "device_settings.h"
#include "animation_preferences.h"
#include "ui/ui_shell.h"

static const char *TAG = "esp32-monitor";

#define DASHBOARD_PHASE_US (5LL * 60 * 1000000)
#define VIDEO_PHASE_US (5LL * 60 * 1000000)

typedef enum {
    DISPLAY_MODE_DASHBOARD,
    DISPLAY_MODE_VIDEO,
    DISPLAY_MODE_PREVIEW,
} display_mode_t;

void app_main(void)
{
    ESP_LOGI(TAG, "ESP32 Monitor firmware started for %dx%d display",
             BOARD_LCD_WIDTH, BOARD_LCD_HEIGHT);
    board_display_init();
    board_touch_init();
    network_client_start(); /* Initializes NVS before loading local preferences. */
    device_settings_init();
    animation_preferences_init();
    media_assets_init();
    const device_settings_t *local=device_settings_get();
    ESP_LOGI(TAG,"Local display: brightness=%u%% reduced=%d screensaver=%d",local->brightness,local->reduced_motion,local->screensaver);
    monitor_lvgl_init();
    dashboard_create();
    monitor_lvgl_benchmark();
    esp_err_t video_result = video_player_init();
    if (video_result != ESP_OK) {
        ESP_LOGW(TAG, "Video screensaver unavailable: %s",
                 esp_err_to_name(video_result));
    }
    ESP_LOGI(TAG, "ST7796S, FT6336U and LVGL dashboard initialized");
    monitor_config_application_t applied_config = {0};
    int64_t last_ui_update_ms = 0;
    /* Single main-task owner. Task titles make these snapshots >1KB each;
     * keep them in static RAM instead of the startup/render stack. */
    static ui_model_t ui_model;
    static monitor_telemetry_t telemetry;
    ui_model_init(&ui_model);
    display_mode_t display_mode = DISPLAY_MODE_DASHBOARD;
    int64_t mode_started_us = esp_timer_get_time();
    int64_t observed_touch_us = monitor_lvgl_last_touch_us();
    int64_t next_phase_log_us = mode_started_us + 60000000LL;
    bool sync_wait_logged=false;
    bool preview_released=false;

    while (true) {
        if (network_client_poll(&telemetry)) {
            video_player_set_clock(telemetry.clock_seconds, telemetry.clock_received_at_ms, telemetry.clock_valid);
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
        bool study_active = ui_model.study.available && study_status_blocks_media(ui_model.study.status);
        if(study_active)media_assets_cancel_preview();
        if(display_mode==DISPLAY_MODE_DASHBOARD) media_assets_prepare_selected();
        if(!video_player_is_active()) media_assets_sync(ui_model.connection==MONITOR_CONNECTION_ONLINE,
                                                       video_player_storage_mounted(),display_mode==DISPLAY_MODE_DASHBOARD&&device_settings_get()->screensaver);
        if(display_mode==DISPLAY_MODE_DASHBOARD && !study_active && media_assets_take_preview()) {
            if(video_player_start_preview(now_us)==ESP_OK) {
                display_mode=DISPLAY_MODE_PREVIEW;mode_started_us=now_us;preview_released=false;
                ESP_LOGI(TAG,"Animation preview started; touch or 8 seconds returns to settings");
            }
        }
        bool keep_dashboard=study_active || (display_mode!=DISPLAY_MODE_PREVIEW && !device_settings_get()->screensaver);
        if (keep_dashboard) {
            mode_started_us = now_us;
            if (display_mode != DISPLAY_MODE_DASHBOARD) {
                video_player_stop(); board_display_set_backlight(true); monitor_lvgl_force_redraw();
                display_mode = DISPLAY_MODE_DASHBOARD;
                ESP_LOGI(TAG, "Dashboard restored for active study session");
            }
        }

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
                static media_library_snapshot_t media_summary;
                media_assets_snapshot(&media_summary);
                ESP_LOGI(TAG, "Main stack minimum free: %u", (unsigned)uxTaskGetStackHighWaterMark(NULL));
                ESP_LOGI(TAG, "Dashboard idle %lld/300s, video available=%s, media sync=%s",
                         (long long)((now_us-mode_started_us)/1000000LL),
                         video_player_is_available() ? "yes" : "no",
                         media_assets_busy()?"busy":media_assets_ready()?"ready":"pending");
                ESP_LOGI(TAG,"Playback plan %s; TF cache %u/%u; study status=%d; settings=%d",
                         animation_preferences_get()->mode==ANIMATION_SEQUENCE?"queue":"single",
                         media_summary.cached_count,media_summary.count,(int)ui_model.study.status,(int)ui_shell_is_settings_open());
                next_phase_log_us = now_us + 60000000LL;
            }

            if (!keep_dashboard && now_us - mode_started_us >= DASHBOARD_PHASE_US &&
                now_us-monitor_lvgl_last_touch_us()>=DASHBOARD_PHASE_US) {
                if(media_assets_busy()) {
                    if(!sync_wait_logged) ESP_LOGI(TAG,"Video start deferred until media synchronization completes");
                    sync_wait_logged=true;
                } else if (video_player_start(now_us) == ESP_OK) {
                    media_assets_session_started();
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
            bool touched=board_touch_read(&point);
            if(display_mode==DISPLAY_MODE_PREVIEW && !preview_released) {
                if(!touched) preview_released=true;
                touched=false;
            }
            if (touched) {
                video_player_stop();
                board_display_set_backlight(true);
                monitor_lvgl_force_redraw();
                display_mode = DISPLAY_MODE_DASHBOARD;
                mode_started_us = now_us;
                observed_touch_us = monitor_lvgl_last_touch_us();
                ESP_LOGI(TAG, "Dashboard restored by touch at %u,%u",
                         point.x, point.y);
            } else if (display_mode == DISPLAY_MODE_VIDEO || display_mode==DISPLAY_MODE_PREVIEW) {
                int64_t phase=display_mode==DISPLAY_MODE_PREVIEW?8000000LL:VIDEO_PHASE_US;
                if (now_us - mode_started_us >= phase) {
                    video_player_stop();
                    monitor_lvgl_force_redraw();
                    display_mode = DISPLAY_MODE_DASHBOARD;
                    mode_started_us = now_us;
                    ESP_LOGI(TAG, "Video phase complete; dashboard cycle restarted");
                } else if(!video_player_is_active()) {
                    media_library_snapshot_t media;media_assets_snapshot(&media);
                    if(media_assets_ready()) {
                        if(video_player_start(now_us)!=ESP_OK) {
                            monitor_lvgl_force_redraw();display_mode=DISPLAY_MODE_DASHBOARD;mode_started_us=now_us;
                        }
                    } else if(!media.busy && media.status==MEDIA_FAILED) {
                        video_player_stop();monitor_lvgl_force_redraw();display_mode=DISPLAY_MODE_DASHBOARD;mode_started_us=now_us;
                        ESP_LOGW(TAG,"Next animation unavailable; dashboard restored");
                    }
                } else {
                    esp_err_t result=video_player_step(now_us);
                    if(result!=ESP_OK && result!=ESP_ERR_NOT_FINISHED) {
                    video_player_stop();
                    monitor_lvgl_force_redraw();
                    display_mode = DISPLAY_MODE_DASHBOARD;
                    mode_started_us = now_us;
                    ESP_LOGW(TAG, "Video playback failed; dashboard restored");
                    }
                }
            }
        }
        // The default ESP-IDF tick period is 10 ms. A 5 ms conversion rounds
        // down to zero and starves IDLE0, eventually tripping the task WDT.
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
