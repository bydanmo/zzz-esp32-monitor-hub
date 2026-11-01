#include "lvgl_port.h"
#include <string.h>

#include "esp_timer.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "lvgl.h"

#include "board_config.h"
#include "board_display.h"
#include "board_touch.h"
#include "ui/ui_tokens.generated.h"

#define DRAW_BUFFER_LINES 24
#define UI_REFRESH_PERIOD_MS 20
/* One read period is 30 ms; keep a press alive through a short I2C glitch
 * instead of turning it into a release. */
#define TOUCH_FAILURES_BEFORE_RELEASE 3

static lv_disp_draw_buf_t draw_buffer;
DMA_ATTR static lv_color_t pixels[2][BOARD_LCD_WIDTH * DRAW_BUFFER_LINES];
_Static_assert(LV_COLOR_DEPTH==16 && !LV_COLOR_16_SWAP,"LCD flush expects native RGB565");
static int64_t render_started_us;
static uint32_t render_pixels,render_strips;
static struct {lv_disp_drv_t *driver;int64_t started;uint32_t pixels,strips;bool last;} transfer;
static portMUX_TYPE perf_lock=portMUX_INITIALIZER_UNLOCKED;
static struct {uint32_t count,large_count,max_us,last_pixels,last_strips;uint64_t total_us,large_us;} perf;
static int64_t next_perf_log_us;
#ifdef MONITOR_DISPLAY_BENCHMARK
static uint32_t benchmark_us[2][3];
static bool benchmark_ready;
static int64_t next_benchmark_log_us;
static void report_benchmark(void)
{
    for(int mode=0;mode<2;mode++)ESP_LOGI("lvgl-port","UI A/B %s complete full refresh us: %lu,%lu,%lu; same scene, SPI 40 MHz",
        mode?"double":"single",(unsigned long)benchmark_us[mode][0],(unsigned long)benchmark_us[mode][1],(unsigned long)benchmark_us[mode][2]);
    next_benchmark_log_us=esp_timer_get_time()+30000000LL;
}
#endif
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
    (void)context;
    if(transfer.last) {
        uint32_t elapsed=(uint32_t)(esp_timer_get_time()-transfer.started);
        portENTER_CRITICAL_ISR(&perf_lock);
        perf.count++;perf.total_us+=elapsed;
        if(transfer.pixels>=BOARD_LCD_WIDTH*BOARD_LCD_HEIGHT/2){perf.large_count++;perf.large_us+=elapsed;}
        if(elapsed>perf.max_us)perf.max_us=elapsed;
        perf.last_pixels=transfer.pixels;perf.last_strips=transfer.strips;
        portEXIT_CRITICAL_ISR(&perf_lock);
    }
    lv_disp_flush_ready(transfer.driver);
}

static void render_start(lv_disp_drv_t *driver)
{
    (void)driver;render_started_us=esp_timer_get_time();render_pixels=render_strips=0;
}

static void wait_transfer(lv_disp_drv_t *driver)
{
    (void)driver;ESP_ERROR_CHECK(board_display_wait());
}

static void flush_callback(lv_disp_drv_t *driver, const lv_area_t *area, lv_color_t *color_map)
{
    const size_t pixel_count = (size_t)(area->x2 - area->x1 + 1) *
                               (size_t)(area->y2 - area->y1 + 1);
    render_pixels+=(uint32_t)pixel_count;render_strips++;
    transfer.driver=driver;transfer.started=render_started_us;transfer.pixels=render_pixels;
    transfer.strips=render_strips;transfer.last=lv_disp_flush_is_last(driver);
    board_display_flush(area->x1, area->y1, area->x2, area->y2,
                        (uint16_t *)color_map, pixel_count, flush_ready, NULL);
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
    lv_disp_draw_buf_init(&draw_buffer, pixels[0], pixels[1], BOARD_LCD_WIDTH * DRAW_BUFFER_LINES);

    static lv_disp_drv_t driver;
    lv_disp_drv_init(&driver);
    driver.hor_res = BOARD_LCD_WIDTH;
    driver.ver_res = BOARD_LCD_HEIGHT;
    driver.flush_cb = flush_callback;
    driver.draw_buf = &draw_buffer;
    driver.wait_cb=wait_transfer;
    driver.render_start_cb=render_start;
    lv_disp_t *display=lv_disp_drv_register(&driver);
    lv_timer_set_period(display->refr_timer,UI_REFRESH_PERIOD_MS);
    lv_timer_set_period(lv_anim_get_timer(),UI_REFRESH_PERIOD_MS);
    ESP_LOGI("lvgl-port","UI pipeline: two %d-line DMA buffers, direct transfer, refresh request %d ms; SPI 40 MHz",DRAW_BUFFER_LINES,UI_REFRESH_PERIOD_MS);

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
    int64_t now=esp_timer_get_time();
    if(now>=next_perf_log_us) {
        uint32_t count,large,max_us,last_pixels,last_strips;uint64_t total_us,large_us;
        portENTER_CRITICAL(&perf_lock);
        count=perf.count;large=perf.large_count;max_us=perf.max_us;last_pixels=perf.last_pixels;last_strips=perf.last_strips;
        total_us=perf.total_us;large_us=perf.large_us;memset(&perf,0,sizeof(perf));
        portEXIT_CRITICAL(&perf_lock);
        if(count)ESP_LOGI("lvgl-port","UI completed: %lu refreshes, avg %.1f ms max %.1f ms; large %lu avg %.1f ms; last %lu pixels/%lu strips",
            (unsigned long)count,(double)total_us/count/1000,max_us/1000.0,(unsigned long)large,large?(double)large_us/large/1000:0.0,
            (unsigned long)last_pixels,(unsigned long)last_strips);
        next_perf_log_us=now+2000000LL;
    }
#ifdef MONITOR_DISPLAY_BENCHMARK
    if(benchmark_ready&&now>=next_benchmark_log_us)report_benchmark();
#endif
}

void monitor_lvgl_benchmark(void)
{
#ifdef MONITOR_DISPLAY_BENCHMARK
    /* Startup-only, same page and SPI clock. No input handler, configuration
     * writes or learning controls run during these forced redraws. */
    lv_disp_t *display=lv_disp_get_default();
    lv_timer_pause(lv_anim_get_timer());
    for(int sample=-1;sample<3;sample++) {
        for(int mode=0;mode<2;mode++) {
            ESP_ERROR_CHECK(board_display_wait());
            lv_disp_draw_buf_init(&draw_buffer,pixels[0],mode?pixels[1]:NULL,BOARD_LCD_WIDTH*DRAW_BUFFER_LINES);
            lv_obj_invalidate(lv_scr_act());
            int64_t start=esp_timer_get_time();
            lv_refr_now(display);
            ESP_ERROR_CHECK(board_display_wait());
            if(sample>=0)benchmark_us[mode][sample]=(uint32_t)(esp_timer_get_time()-start);
        }
    }
    lv_disp_draw_buf_init(&draw_buffer,pixels[0],pixels[1],BOARD_LCD_WIDTH*DRAW_BUFFER_LINES);
    lv_timer_resume(lv_anim_get_timer());
    benchmark_ready=true;report_benchmark();
#endif
}

int64_t monitor_lvgl_last_touch_us(void)
{
    return last_touch_us;
}

void monitor_lvgl_force_redraw(void)
{
    /* The touch used to leave raw video is a wake-up, not a click on the
     * underlying settings button. Resume pointer events only after release. */
    for(lv_indev_t *input=lv_indev_get_next(NULL);input;input=lv_indev_get_next(input)) {
        lv_indev_wait_release(input);
    }
    lv_obj_invalidate(lv_scr_act());
}
