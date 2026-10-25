#include "network_client.h"
#include "config_delivery.h"

#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_websocket_client.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "nvs_flash.h"

#include "wifi_config.h"
#include "ui/ui_text_zh.h"

static const char *TAG = "network-client";
/* The WebSocket client retries on its own. A single failed attempt is
 * "reconnecting"; this many in a row without a single frame means the Hub is
 * gone, which is the only way MONITOR_CONNECTION_OFFLINE is reached. */
#define HUB_OFFLINE_AFTER_FAILURES 3
static portMUX_TYPE state_lock = portMUX_INITIALIZER_UNLOCKED;
static uint32_t hub_connect_failures; /* guarded by state_lock */
static monitor_telemetry_t state = {
    .cpu_state = MONITOR_SAMPLE_WAITING,
    .memory_state = MONITOR_SAMPLE_WAITING,
    .exam_state = MONITOR_SAMPLE_WAITING,
    .connection = MONITOR_CONNECTION_STARTING,
    .display = {
        .revision = 1,
        .title = UI_TEXT_DEFAULT_TITLE,
        .page = MONITOR_PAGE_OVERVIEW,
        .background_color = 0x0D131B,
        .card_color = 0x17212D,
        .accent_color = 0x63D8C5,
        .data_text_color = 0xF2F6FA,
        .show_cpu = true,
        .show_memory = true,
        .show_exam = true,
    },
};
static uint32_t state_version = 1;
static uint32_t consumed_version;
static esp_websocket_client_handle_t websocket;
static monitor_config_delivery_t config_delivery; /* guarded by state_lock */
static char device_id[32];

static void ensure_device_id(void)
{
    if (device_id[0] != '\0') return;
    uint8_t mac[6] = {0};
    if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) {
        strlcpy(device_id, "esp32s3-unknown", sizeof(device_id));
        return;
    }
    snprintf(device_id, sizeof(device_id), "esp32s3-%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static void publish_connection(monitor_connection_state_t connection)
{
    portENTER_CRITICAL(&state_lock);
    state.connection = connection;
    state_version++;
    portEXIT_CRITICAL(&state_lock);
}

static void publish_hub_disconnected(void)
{
    portENTER_CRITICAL(&state_lock);
    monitor_config_delivery_disconnected(&config_delivery);
    if (hub_connect_failures < HUB_OFFLINE_AFTER_FAILURES) hub_connect_failures++;
    state.connection = hub_connect_failures >= HUB_OFFLINE_AFTER_FAILURES
        ? MONITOR_CONNECTION_OFFLINE
        : MONITOR_CONNECTION_RECONNECTING;
    state_version++;
    portEXIT_CRITICAL(&state_lock);
}

static bool parse_color(const cJSON *item, uint32_t *color)
{
    if (!cJSON_IsString(item) || item->valuestring == NULL ||
        strlen(item->valuestring) != 7 || item->valuestring[0] != '#') {
        return false;
    }
    char *end = NULL;
    unsigned long value = strtoul(item->valuestring + 1, &end, 16);
    if (end == NULL || *end != '\0' || value > 0xFFFFFFUL) return false;
    *color = (uint32_t)value;
    return true;
}

static bool valid_title(const char *title)
{
    if (title == NULL) return false;
    size_t byte_length = strlen(title);
    if (byte_length == 0 || byte_length > 48) return false;

    size_t character_count = 0;
    for (size_t index = 0; index < byte_length;) {
        unsigned char first = (unsigned char)title[index];
        if (first >= 0x20 && first <= 0x7E) {
            index++;
        } else {
            if (index + 2 >= byte_length || first < 0xE0 || first > 0xEF ||
                ((unsigned char)title[index + 1] & 0xC0) != 0x80 ||
                ((unsigned char)title[index + 2] & 0xC0) != 0x80) {
                return false;
            }
            bool supported = false;
            const char *glyph = UI_TEXT_SUPPORTED_TITLE_GLYPHS;
            while (*glyph != '\0') {
                if (memcmp(title + index, glyph, 3) == 0) {
                    supported = true;
                    break;
                }
                glyph += 3;
            }
            if (!supported) return false;
            index += 3;
        }
        if (++character_count > 12) return false;
    }
    return true;
}

static bool parse_display_config(const cJSON *config, monitor_display_config_t *display)
{
    if (!cJSON_IsObject(config)) return false;
    const cJSON *revision = cJSON_GetObjectItemCaseSensitive(config, "revision");
    const cJSON *title = cJSON_GetObjectItemCaseSensitive(config, "title");
    const cJSON *page = cJSON_GetObjectItemCaseSensitive(config, "page");
    const cJSON *theme = cJSON_GetObjectItemCaseSensitive(config, "theme");
    const cJSON *visible = cJSON_GetObjectItemCaseSensitive(config, "visible");
    if (!cJSON_IsNumber(revision) || !isfinite(revision->valuedouble) ||
        revision->valuedouble < 0 || revision->valuedouble > UINT32_MAX ||
        floor(revision->valuedouble) != revision->valuedouble ||
        !cJSON_IsString(title) || !valid_title(title->valuestring) ||
        !cJSON_IsString(page) || page->valuestring == NULL ||
        !cJSON_IsObject(theme) || !cJSON_IsObject(visible)) {
        return false;
    }

    const cJSON *background = cJSON_GetObjectItemCaseSensitive(theme, "background");
    const cJSON *card = cJSON_GetObjectItemCaseSensitive(theme, "card");
    const cJSON *accent = cJSON_GetObjectItemCaseSensitive(theme, "accent");
    const cJSON *data_text = cJSON_GetObjectItemCaseSensitive(theme, "dataText");
    const cJSON *show_cpu = cJSON_GetObjectItemCaseSensitive(visible, "cpu");
    const cJSON *show_memory = cJSON_GetObjectItemCaseSensitive(visible, "memory");
    const cJSON *show_exam = cJSON_GetObjectItemCaseSensitive(visible, "exam");
    display->data_text_color = 0xF2F6FA;
    if (!parse_color(background, &display->background_color) ||
        !parse_color(card, &display->card_color) ||
        !parse_color(accent, &display->accent_color) ||
        (data_text != NULL && !parse_color(data_text, &display->data_text_color)) ||
        !cJSON_IsBool(show_cpu) || !cJSON_IsBool(show_memory) || !cJSON_IsBool(show_exam)) {
        return false;
    }

    if (strcmp(page->valuestring, "overview") == 0) {
        display->page = MONITOR_PAGE_OVERVIEW;
    } else if (strcmp(page->valuestring, "system") == 0) {
        display->page = MONITOR_PAGE_SYSTEM;
    } else if (strcmp(page->valuestring, "study") == 0) {
        display->page = MONITOR_PAGE_STUDY;
    } else {
        return false;
    }

    display->show_cpu = cJSON_IsTrue(show_cpu);
    display->show_memory = cJSON_IsTrue(show_memory);
    display->show_exam = cJSON_IsTrue(show_exam);
    if (!display->show_cpu && !display->show_memory && !display->show_exam) return false;
    if (display->page == MONITOR_PAGE_SYSTEM && !display->show_cpu && !display->show_memory) return false;
    if (display->page == MONITOR_PAGE_STUDY && !display->show_exam) return false;

    display->revision = (uint32_t)revision->valuedouble;
    strlcpy(display->title, title->valuestring, sizeof(display->title));
    return true;
}

static monitor_sample_state_t parse_percent(const cJSON *item, float *value)
{
    if (item == NULL || cJSON_IsNull(item)) return MONITOR_SAMPLE_MISSING;
    if (!cJSON_IsNumber(item) || !isfinite(item->valuedouble) ||
        item->valuedouble < 0.0 || item->valuedouble > 100.0) {
        return MONITOR_SAMPLE_INVALID;
    }
    *value = (float)item->valuedouble;
    return MONITOR_SAMPLE_VALID;
}

static monitor_sample_state_t parse_seconds(const cJSON *item, uint32_t *value)
{
    if (item == NULL || cJSON_IsNull(item)) return MONITOR_SAMPLE_MISSING;
    if (!cJSON_IsNumber(item) || !isfinite(item->valuedouble) ||
        item->valuedouble < 0.0 || item->valuedouble > UINT32_MAX) {
        return MONITOR_SAMPLE_INVALID;
    }
    *value = (uint32_t)floor(item->valuedouble);
    return MONITOR_SAMPLE_VALID;
}

static void parse_telemetry(const char *data, int length)
{
    if (length <= 0 || length >= 512) {
        ESP_LOGW(TAG, "Ignored telemetry length=%d", length);
        return;
    }
    char json[512];
    memcpy(json, data, (size_t)length);
    json[length] = '\0';
    cJSON *root = cJSON_Parse(json);
    if (root == NULL) {
        ESP_LOGW(TAG, "Invalid telemetry JSON: %.*s", length, data);
        return;
    }

    const cJSON *type = cJSON_GetObjectItemCaseSensitive(root, "type");
    if (!cJSON_IsString(type) || strcmp(type->valuestring, "telemetry") != 0) {
        ESP_LOGW(TAG, "Ignored unexpected device message");
        cJSON_Delete(root);
        return;
    }

    float cpu_value = 0.0f;
    float memory_value = 0.0f;
    uint32_t exam_value = 0;
    monitor_sample_state_t cpu_state = parse_percent(
        cJSON_GetObjectItemCaseSensitive(root, "cpu"), &cpu_value);
    monitor_sample_state_t memory_state = parse_percent(
        cJSON_GetObjectItemCaseSensitive(root, "memory"), &memory_value);
    monitor_sample_state_t exam_state = parse_seconds(
        cJSON_GetObjectItemCaseSensitive(root, "examSeconds"), &exam_value);

    monitor_display_config_t display = {0};
    bool valid_config = parse_display_config(
        cJSON_GetObjectItemCaseSensitive(root, "config"), &display);
    int64_t received_at_ms = esp_timer_get_time() / 1000;

    portENTER_CRITICAL(&state_lock);
    state.cpu_percent = cpu_value;
    state.memory_percent = memory_value;
    state.exam_seconds = exam_value;
    state.cpu_state = cpu_state;
    state.memory_state = memory_state;
    state.exam_state = exam_state;
    state.received_at_ms = received_at_ms;
    state.connection = MONITOR_CONNECTION_ONLINE;
    hub_connect_failures = 0;
    if (valid_config) {
        state.display = display;
        state.display_valid = true;
    }
    state_version++;
    portEXIT_CRITICAL(&state_lock);

    ESP_LOGI(TAG, "Telemetry received: cpu_state=%d memory_state=%d exam_state=%d config=%lu",
             cpu_state, memory_state, exam_state,
             (unsigned long)(valid_config ? display.revision : state.display.revision));
    cJSON_Delete(root);
}

static void websocket_event(void *handler_arg, esp_event_base_t base, int32_t event_id,
                            void *event_data)
{
    (void)handler_arg;
    (void)base;
    esp_websocket_event_data_t *event = event_data;
    if (event_id == WEBSOCKET_EVENT_CONNECTED) {
        ESP_LOGI(TAG, "Hub WebSocket connected; waiting for telemetry");
        portENTER_CRITICAL(&state_lock);
        monitor_config_delivery_connected(&config_delivery);
        state.connection = MONITOR_CONNECTION_HUB_CONNECTING;
        state_version++;
        portEXIT_CRITICAL(&state_lock);
    } else if (event_id == WEBSOCKET_EVENT_DISCONNECTED) {
        publish_hub_disconnected();
    } else if (event_id == WEBSOCKET_EVENT_DATA && event->op_code == 1 &&
               event->payload_len == event->data_len) {
        parse_telemetry(event->data_ptr, event->data_len);
    } else if (event_id == WEBSOCKET_EVENT_DATA) {
        ESP_LOGW(TAG, "Ignored WebSocket frame: opcode=%u payload=%d data=%d offset=%d",
                 event->op_code, event->payload_len, event->data_len, event->payload_offset);
    }
}

static void flush_outgoing_messages(void)
{
    if (websocket == NULL || !esp_websocket_client_is_connected(websocket)) return;

    portENTER_CRITICAL(&state_lock);
    monitor_config_message_t message = monitor_config_delivery_next(&config_delivery);
    portEXIT_CRITICAL(&state_lock);
    if (message.kind == MONITOR_CONFIG_MESSAGE_NONE) return;

    ensure_device_id();
    if (message.kind == MONITOR_CONFIG_MESSAGE_HELLO) {
        const esp_app_desc_t *description = esp_app_get_description();
        char json[384];
        int length = snprintf(json, sizeof(json),
            "{\"type\":\"hello\",\"protocolVersion\":1,\"device\":{"
            "\"id\":\"%s\",\"model\":\"esp32-s3-st7796s-480x320\","
            "\"firmwareVersion\":\"%s\",\"capabilities\":["
            "\"touch\",\"tf-video\",\"config-ack\"]}}",
            device_id, description->version);
        bool sent = length > 0 && length < (int)sizeof(json) &&
            esp_websocket_client_send_text(websocket, json, length,
                                           pdMS_TO_TICKS(1000)) == length;
        portENTER_CRITICAL(&state_lock);
        monitor_config_delivery_sent(&config_delivery, message, sent);
        portEXIT_CRITICAL(&state_lock);
        if (sent) {
            ESP_LOGI(TAG, "Device hello sent: %s firmware=%s", device_id,
                     description->version);
        }
    } else if (message.kind == MONITOR_CONFIG_MESSAGE_ACK) {
        char json[192];
        int length = snprintf(json, sizeof(json),
            "{\"type\":\"configAck\",\"deviceId\":\"%s\","
            "\"revision\":%lu,\"status\":\"applied\"}",
            device_id, (unsigned long)message.revision);
        bool sent = length > 0 && length < (int)sizeof(json) &&
            esp_websocket_client_send_text(websocket, json, length,
                                           pdMS_TO_TICKS(1000)) == length;
        portENTER_CRITICAL(&state_lock);
        monitor_config_delivery_sent(&config_delivery, message, sent);
        portEXIT_CRITICAL(&state_lock);
        if (sent) {
            ESP_LOGI(TAG, "Config ACK sent: revision=%lu", (unsigned long)message.revision);
        }
    }
}

static void start_websocket(void)
{
    if (websocket != NULL) return;
    const esp_websocket_client_config_t config = {
        .uri = MONITOR_HUB_WS_URL,
        .buffer_size = 1024,
        .network_timeout_ms = 5000,
        .reconnect_timeout_ms = 5000,
    };
    websocket = esp_websocket_client_init(&config);
    ESP_ERROR_CHECK(esp_websocket_register_events(websocket, WEBSOCKET_EVENT_ANY,
                                                   websocket_event, NULL));
    ESP_ERROR_CHECK(esp_websocket_client_start(websocket));
}

static void network_event(void *arg, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)arg;
    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        publish_connection(MONITOR_CONNECTION_WIFI_CONNECTING);
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        const wifi_event_sta_disconnected_t *disconnected = event_data;
        ESP_LOGW(TAG, "Wi-Fi disconnected, reason=%d", disconnected->reason);
        /* Losing Wi-Fi reports the Wi-Fi stage, not a missing Hub; the Hub failure
         * count restarts once the link is back. */
        portENTER_CRITICAL(&state_lock);
        hub_connect_failures = 0;
        portEXIT_CRITICAL(&state_lock);
        publish_connection(MONITOR_CONNECTION_WIFI_CONNECTING);
        esp_wifi_connect();
    } else if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        publish_connection(MONITOR_CONNECTION_HUB_CONNECTING);
        start_websocket();
    }
}

void network_client_start(void)
{
    esp_err_t result = nvs_flash_init();
    if (result == ESP_ERR_NVS_NO_FREE_PAGES || result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(result);
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, network_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, network_event, NULL));
    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, MONITOR_WIFI_SSID, sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, MONITOR_WIFI_PASSWORD, sizeof(config.sta.password));
    config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "Wi-Fi station started; Hub endpoint configured");
}

bool network_client_poll(monitor_telemetry_t *telemetry)
{
    flush_outgoing_messages();
    bool changed = false;
    portENTER_CRITICAL(&state_lock);
    if (consumed_version != state_version) {
        *telemetry = state;
        consumed_version = state_version;
        changed = true;
    }
    portEXIT_CRITICAL(&state_lock);
    return changed;
}

void network_client_ack_config_applied(uint32_t revision)
{
    portENTER_CRITICAL(&state_lock);
    monitor_config_delivery_applied(&config_delivery, revision);
    portEXIT_CRITICAL(&state_lock);
}
