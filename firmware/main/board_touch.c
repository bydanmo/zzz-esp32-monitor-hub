#include "board_touch.h"

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_check.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "board_config.h"

#define FT6336U_ADDRESS 0x38
#define FT6336U_TOUCH_COUNT_REGISTER 0x02
#define FT6336U_POINT_1_REGISTER 0x03

static const char *TAG = "board-touch";
static i2c_master_dev_handle_t touch_device;
static int64_t last_error_log_ms;

static void log_read_error(const char *operation, esp_err_t result)
{
    int64_t now_ms = esp_timer_get_time() / 1000;
    if (last_error_log_ms == 0 || now_ms - last_error_log_ms >= 1000) {
        ESP_LOGW(TAG, "%s failed: %s", operation, esp_err_to_name(result));
        last_error_log_ms = now_ms;
    }
}

void board_touch_init(void)
{
    const i2c_master_bus_config_t bus_config = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = BOARD_TOUCH_SDA_GPIO,
        .scl_io_num = BOARD_TOUCH_SCL_GPIO,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    i2c_master_bus_handle_t bus;
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, &bus));
    const i2c_device_config_t device_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = FT6336U_ADDRESS,
        .scl_speed_hz = 400000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus, &device_config, &touch_device));
}

bool board_touch_read(board_touch_point_t *point)
{
    uint8_t count = 0;
    const uint8_t count_register = FT6336U_TOUCH_COUNT_REGISTER;
    esp_err_t result = i2c_master_transmit_receive(touch_device, &count_register, 1,
                                                   &count, 1, 20);
    if (result != ESP_OK) {
        log_read_error("Touch count read", result);
        return false;
    }
    const uint8_t touch_count = count & 0x0F;
    if (touch_count == 0 || touch_count > 2) return false;

    uint8_t raw[4] = {0};
    const uint8_t point_register = FT6336U_POINT_1_REGISTER;
    result = i2c_master_transmit_receive(touch_device, &point_register, 1,
                                         raw, sizeof(raw), 20);
    if (result != ESP_OK) {
        log_read_error("Touch point read", result);
        return false;
    }
    const uint16_t raw_x = ((raw[0] & 0x0F) << 8) | raw[1];
    const uint16_t raw_y = ((raw[2] & 0x0F) << 8) | raw[3];

    // The FT6336U reports portrait coordinates (320 x 480). This board's
    // ST7796 initialization uses the opposite landscape direction from the
    // vendor demo: screen X is raw Y and screen Y is inverted raw X.
    if (raw_x >= BOARD_LCD_HEIGHT || raw_y >= BOARD_LCD_WIDTH) return false;
    point->x = raw_y;
    point->y = (BOARD_LCD_HEIGHT - 1) - raw_x;
    return true;
}
