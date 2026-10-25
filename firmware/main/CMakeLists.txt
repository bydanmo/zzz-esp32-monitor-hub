idf_component_register(SRCS "main.c" "board_config.c" "board_display.c" "board_touch.c" "dashboard.c" "lvgl_port.c" "network_client.c" "config_delivery.c" "video_player.c" "media_assets.c"
                            "ui/ui_model.c" "ui/ui_router.c" "ui/ui_motion.c" "ui/ui_shell.c" "ui/ui_font_zh_16.c"
                            "ui/ui_font_numeric_28.c" "ui/ui_font_numeric_40.c" "ui/ui_font_numeric_56.c"
                            "ui/ui_font_poster_84.c" "ui/ui_font_poster_112.c" "ui/ui_art.c"
                       INCLUDE_DIRS "." "ui"
                       REQUIRES driver esp_app_format esp_lcd lvgl esp_wifi esp_event esp_netif esp_websocket_client esp_http_client json nvs_flash fatfs)
