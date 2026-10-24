#include "lvgl_port.h"

#include "esp_timer.h"
#include "lvgl.h"

#include "board_config.h"
#include "board_display.h"
#include "board_touch.h"
#include "ui/ui_tokens.generated.h"

#define DRAW_BUFFER_LINES 24
/* One read period is 30 ms; keep a press alive through a short I2C glitch
 * instead of turning it into a release. */
#define TOUCH_FAILURES_BEFORE_RELEASE 3

static lv_disp_draw_buf_t draw_buffer;
static lv_color_t pixels[BOARD_LCD_WIDTH * DRAW_BUFFER_LINES];
static lv_point_t last_touch_point;
static bool touch_was_pressed;
static int64_t last_touch_us;

static void tick_callback(void *arg)
{
    (void)arg;
    lv_tick_inc(5);
}

static void flush_ready(void *context)
{
    lv_disp_flush_ready((lv_disp_drv_t *)context);
}

static void flush_callback(lv_disp_drv_t *driver, const lv_area_t *area, lv_color_t *color_map)
{
    const size_t pixel_count = (size_t)(area->x2 - area->x1 + 1) *
                               (size_t)(area->y2 - area->y1 + 1);
    board_display_flush(area->x1, area->y1, area->x2, area->y2,
                        (const uint16_t *)color_map, pixel_count, flush_ready, driver);
}

static void touch_read_callback(lv_indev_drv_t *driver, lv_indev_data_t *data)
{
    (void)driver;
    static uint32_t consecutive_failures;
    board_touch_point_t point;
    if (board_touch_read(&point)) {
        last_touch_us = esp_timer_get_time();
        consecutive_failures = 0;
        touch_was_pressed = true;
        last_touch_point.x = (lv_coord_t)point.x;
        last_touch_point.y = (lv_coord_t)point.y;
        data->point = last_touch_point;
        data->state = LV_INDEV_STATE_PRESSED;
        return;
    }

    consecutive_failures++;
    data->point = last_touch_point;
    /* A failed read is not a release: reporting one cut presses and swipes short
     * and could turn a glitch into a stray click. Only a sustained failure ends
     * the press. */
    data->state = (touch_was_pressed && consecutive_failures < TOUCH_FAILURES_BEFORE_RELEASE)
        ? LV_INDEV_STATE_PRESSED
        : LV_INDEV_STATE_RELEASED;
    if (data->state == LV_INDEV_STATE_RELEASED) touch_was_pressed = false;
}

void monitor_lvgl_init(void)
{
    last_touch_us = esp_timer_get_time();
    lv_init();
    lv_disp_draw_buf_init(&draw_buffer, pixels, NULL, BOARD_LCD_WIDTH * DRAW_BUFFER_LINES);

    static lv_disp_drv_t driver;
    lv_disp_drv_init(&driver);
    driver.hor_res = BOARD_LCD_WIDTH;
    driver.ver_res = BOARD_LCD_HEIGHT;
    driver.flush_cb = flush_callback;
    driver.draw_buf = &draw_buffer;
    lv_disp_drv_register(&driver);

    static lv_indev_drv_t touch_driver;
    lv_indev_drv_init(&touch_driver);
    touch_driver.type = LV_INDEV_TYPE_POINTER;
    touch_driver.read_cb = touch_read_callback;
    /* LVGL's gesture threshold is the LV_INDEV_DEF_GESTURE_LIMIT macro (50 px) and
     * has no Kconfig or lv_conf.h route in this version, so the design value from
     * shared/ui-tokens.json is applied on the driver we register. */
    touch_driver.gesture_limit = UI_GESTURE_LIMIT_PX;
    lv_indev_drv_register(&touch_driver);

    const esp_timer_create_args_t timer_args = {
        .callback = tick_callback,
        .name = "lvgl-tick",
    };
    esp_timer_handle_t timer;
    ESP_ERROR_CHECK(esp_timer_create(&timer_args, &timer));
    ESP_ERROR_CHECK(esp_timer_start_periodic(timer, 5000));
}

void monitor_lvgl_run(void)
{
    lv_timer_handler();
}

int64_t monitor_lvgl_last_touch_us(void)
{
    return last_touch_us;
}

void monitor_lvgl_force_redraw(void)
{
    lv_obj_invalidate(lv_scr_act());
}
