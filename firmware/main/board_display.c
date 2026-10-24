#include "board_display.h"

#include <assert.h>
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_lcd_panel_io.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#include "board_config.h"

#define LCD_HOST SPI2_HOST
#define LCD_PIXEL_CLOCK_HZ (40 * 1000 * 1000)
#define LCD_DRAW_LINES 40

static const char *TAG = "board-display";
static esp_lcd_panel_io_handle_t lcd_io;
static uint16_t flush_buffer[BOARD_LCD_WIDTH * LCD_DRAW_LINES];
static board_display_flush_done_cb_t flush_done_cb;
static void *flush_done_context;
static SemaphoreHandle_t transfer_done;
static volatile bool transfer_in_progress;

static bool on_color_trans_done(esp_lcd_panel_io_handle_t io,
                                esp_lcd_panel_io_event_data_t *event_data,
                                void *user_context)
{
    (void)io;
    (void)event_data;
    (void)user_context;
    BaseType_t task_woken = pdFALSE;
    transfer_in_progress = false;
    if (transfer_done != NULL) {
        xSemaphoreGiveFromISR(transfer_done, &task_woken);
    }
    if (flush_done_cb != NULL) {
        board_display_flush_done_cb_t callback = flush_done_cb;
        void *context = flush_done_context;
        flush_done_cb = NULL;
        flush_done_context = NULL;
        callback(context);
    }
    return task_woken == pdTRUE;
}

static void send_command(uint8_t command, const uint8_t *params, size_t length)
{
    ESP_ERROR_CHECK(esp_lcd_panel_io_tx_param(lcd_io, command, params, length));
}

static void send_st7796s_init_sequence(void)
{
    static const uint8_t f0_c3[] = {0xC3};
    static const uint8_t f0_96[] = {0x96};
    static const uint8_t madctl[] = {0x28};
    static const uint8_t rgb565[] = {0x05};
    static const uint8_t b0[] = {0x80};
    static const uint8_t b6[] = {0x00, 0x02};
    static const uint8_t b5[] = {0x02, 0x03, 0x00, 0x04};
    static const uint8_t b1[] = {0x80, 0x10};
    static const uint8_t b4[] = {0x00};
    static const uint8_t b7[] = {0xC6};
    static const uint8_t c5[] = {0x1C};
    static const uint8_t c2[] = {0xA7};
    static const uint8_t e4[] = {0x31};
    static const uint8_t e8[] = {0x40, 0x8A, 0x00, 0x00, 0x29, 0x19, 0xA5, 0x33};
    static const uint8_t gamma_positive[] = {0xF0, 0x09, 0x13, 0x12, 0x12, 0x2B, 0x3C, 0x44, 0x4B, 0x1B, 0x18, 0x17, 0x1D, 0x21};
    static const uint8_t gamma_negative[] = {0xF0, 0x09, 0x13, 0x0C, 0x0D, 0x27, 0x3B, 0x44, 0x4D, 0x0B, 0x17, 0x17, 0x1D, 0x21};
    static const uint8_t f0_3c[] = {0x3C};
    static const uint8_t f0_69[] = {0x69};

    send_command(0xF0, f0_c3, sizeof(f0_c3));
    send_command(0xF0, f0_96, sizeof(f0_96));
    send_command(0x36, madctl, sizeof(madctl));
    send_command(0x3A, rgb565, sizeof(rgb565));
    send_command(0xB0, b0, sizeof(b0));
    send_command(0xB6, b6, sizeof(b6));
    send_command(0xB5, b5, sizeof(b5));
    send_command(0xB1, b1, sizeof(b1));
    send_command(0xB4, b4, sizeof(b4));
    send_command(0xB7, b7, sizeof(b7));
    send_command(0xC5, c5, sizeof(c5));
    send_command(0xE4, e4, sizeof(e4));
    send_command(0xE8, e8, sizeof(e8));
    send_command(0xC2, c2, sizeof(c2));
    send_command(0xE0, gamma_positive, sizeof(gamma_positive));
    send_command(0xE1, gamma_negative, sizeof(gamma_negative));
    send_command(0x21, NULL, 0);
    send_command(0xF0, f0_3c, sizeof(f0_3c));
    send_command(0xF0, f0_69, sizeof(f0_69));
    send_command(0x13, NULL, 0);
    send_command(0x11, NULL, 0);
    vTaskDelay(pdMS_TO_TICKS(120));
    send_command(0x29, NULL, 0);
    vTaskDelay(pdMS_TO_TICKS(20));
}

void board_display_init(void)
{
    transfer_done = xSemaphoreCreateBinary();
    ESP_ERROR_CHECK(transfer_done == NULL ? ESP_ERR_NO_MEM : ESP_OK);
    // GPIO18 is the ST7796S reset line on ES3C40P. Reset it before sending
    // initialization commands; it must never be reused by the touch driver.
    const gpio_config_t reset_config = {
        .pin_bit_mask = 1ULL << BOARD_LCD_RESET_GPIO,
        .mode = GPIO_MODE_OUTPUT,
    };
    ESP_ERROR_CHECK(gpio_config(&reset_config));
    ESP_ERROR_CHECK(gpio_set_level(BOARD_LCD_RESET_GPIO, 0));
    vTaskDelay(pdMS_TO_TICKS(100));
    ESP_ERROR_CHECK(gpio_set_level(BOARD_LCD_RESET_GPIO, 1));
    vTaskDelay(pdMS_TO_TICKS(100));

    const spi_bus_config_t bus_config = {
        .sclk_io_num = BOARD_LCD_SCLK_GPIO,
        .mosi_io_num = BOARD_LCD_MOSI_GPIO,
        .miso_io_num = BOARD_LCD_MISO_GPIO,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = BOARD_LCD_WIDTH * LCD_DRAW_LINES * sizeof(uint16_t),
    };
    ESP_ERROR_CHECK(spi_bus_initialize(LCD_HOST, &bus_config, SPI_DMA_CH_AUTO));

    const esp_lcd_panel_io_spi_config_t io_config = {
        .dc_gpio_num = BOARD_LCD_DC_GPIO,
        .cs_gpio_num = BOARD_LCD_CS_GPIO,
        .pclk_hz = LCD_PIXEL_CLOCK_HZ,
        .lcd_cmd_bits = 8,
        .lcd_param_bits = 8,
        .spi_mode = 0,
        .trans_queue_depth = 1,
        .on_color_trans_done = on_color_trans_done,
    };
    ESP_ERROR_CHECK(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)LCD_HOST, &io_config, &lcd_io));

    const gpio_config_t backlight_config = {
        .pin_bit_mask = 1ULL << BOARD_LCD_BACKLIGHT_GPIO,
        .mode = GPIO_MODE_OUTPUT,
    };
    ESP_ERROR_CHECK(gpio_config(&backlight_config));
    ESP_ERROR_CHECK(gpio_set_level(BOARD_LCD_BACKLIGHT_GPIO, 1));
    send_st7796s_init_sequence();
    /* The panel shows whatever its RAM held after reset until LVGL draws. Clear it
     * first so a cold boot does not flash noise on the desk. */
    board_display_fill(0x0000);
    ESP_LOGI(TAG, "ST7796S initialized at %d Hz", LCD_PIXEL_CLOCK_HZ);
}

void board_display_set_backlight(bool enabled)
{
    ESP_ERROR_CHECK(gpio_set_level(BOARD_LCD_BACKLIGHT_GPIO, enabled ? 1 : 0));
}

esp_err_t board_display_wait(void)
{
    if (!transfer_in_progress) return ESP_OK;
    if (xSemaphoreTake(transfer_done, pdMS_TO_TICKS(1000)) != pdTRUE) {
        ESP_LOGE(TAG, "LCD transfer timed out");
        return ESP_ERR_TIMEOUT;
    }
    return ESP_OK;
}

esp_err_t board_display_write_rgb565be(int y, int line_count,
                                      const uint8_t *pixels, size_t byte_count)
{
    return board_display_write_rect_rgb565be(0,y,BOARD_LCD_WIDTH,line_count,pixels,byte_count);
}

esp_err_t board_display_write_rect_rgb565be(int x, int y, int width, int line_count,
                                           const uint8_t *pixels, size_t byte_count)
{
    ESP_RETURN_ON_ERROR(board_display_queue_rect_rgb565be(x,y,width,line_count,pixels,byte_count),
                        TAG,"LCD queue failed");
    return board_display_wait();
}

esp_err_t board_display_queue_rect_rgb565be(int x, int y, int width, int line_count,
                                           const uint8_t *pixels, size_t byte_count)
{
    if (pixels == NULL || x < 0 || width <= 0 || x+width > BOARD_LCD_WIDTH ||
        y < 0 || line_count <= 0 ||
        y + line_count > BOARD_LCD_HEIGHT ||
        byte_count != (size_t)width * (size_t)line_count * sizeof(uint16_t)) {
        return ESP_ERR_INVALID_ARG;
    }
    ESP_RETURN_ON_ERROR(board_display_wait(), TAG, "Previous LCD transfer incomplete");

    const int y2 = y + line_count - 1;
    int x2=x+width-1;
    const uint8_t column[] = { (uint8_t)(x>>8),(uint8_t)x,
                                      (uint8_t)(x2>>8),(uint8_t)x2 };
    const uint8_t row[] = { (uint8_t)(y >> 8), (uint8_t)y,
                            (uint8_t)(y2 >> 8), (uint8_t)y2 };
    send_command(0x2A, column, sizeof(column));
    send_command(0x2B, row, sizeof(row));
    xSemaphoreTake(transfer_done, 0);
    transfer_in_progress = true;
    esp_err_t result = esp_lcd_panel_io_tx_color(lcd_io, 0x2C, pixels, byte_count);
    if (result != ESP_OK) {
        transfer_in_progress = false;
        return result;
    }
    return ESP_OK;
}

void board_display_flush(int x1, int y1, int x2, int y2, const uint16_t *pixels,
                         size_t pixel_count, board_display_flush_done_cb_t done_cb,
                         void *context)
{
    const size_t max_pixels = BOARD_LCD_WIDTH * LCD_DRAW_LINES;
    assert(x1 >= 0 && y1 >= 0 && x2 < BOARD_LCD_WIDTH && y2 < BOARD_LCD_HEIGHT);
    assert(pixel_count <= max_pixels);

    for (size_t index = 0; index < pixel_count; index += 1) {
        flush_buffer[index] = __builtin_bswap16(pixels[index]);
    }

    const uint8_t column[] = { (uint8_t)(x1 >> 8), (uint8_t)x1,
                               (uint8_t)(x2 >> 8), (uint8_t)x2 };
    const uint8_t row[] = { (uint8_t)(y1 >> 8), (uint8_t)y1,
                            (uint8_t)(y2 >> 8), (uint8_t)y2 };
    send_command(0x2A, column, sizeof(column));
    send_command(0x2B, row, sizeof(row));
    flush_done_cb = done_cb;
    flush_done_context = context;
    xSemaphoreTake(transfer_done, 0);
    transfer_in_progress = true;
    ESP_ERROR_CHECK(esp_lcd_panel_io_tx_color(lcd_io, 0x2C, flush_buffer,
                                               pixel_count * sizeof(uint16_t)));
}

void board_display_fill(uint16_t color)
{
    static uint16_t lines[BOARD_LCD_WIDTH * LCD_DRAW_LINES];
    for (size_t index = 0; index < BOARD_LCD_WIDTH * LCD_DRAW_LINES; index += 1) {
        lines[index] = __builtin_bswap16(color);
    }
    for (int y = 0; y < BOARD_LCD_HEIGHT; y += LCD_DRAW_LINES) {
        ESP_ERROR_CHECK(board_display_write_rgb565be(y, LCD_DRAW_LINES,
                                                     (const uint8_t *)lines,
                                                     sizeof(lines)));
    }
}
