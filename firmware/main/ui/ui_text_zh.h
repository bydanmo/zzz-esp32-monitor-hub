#pragma once

#define UI_TEXT_DEFAULT_TITLE "ESP32 监控屏"

#define UI_TEXT_WIFI_CONNECTING "Wi-Fi 连接中"
#define UI_TEXT_HUB_CONNECTING "Hub 连接中"
#define UI_TEXT_HUB_ONLINE "Hub 已在线"
#define UI_TEXT_HUB_RECONNECTING "Hub 重连中"
#define UI_TEXT_HUB_OFFLINE "Hub 已离线"
#define UI_TEXT_STARTING "正在启动"

#define UI_TEXT_UPDATED_NOW "刚刚更新"
#define UI_TEXT_DATA_DELAYED "数据延迟"
#define UI_TEXT_DATA_STALE "数据已过期"
#define UI_TEXT_UNAVAILABLE "暂无数据"
#define UI_TEXT_DATA_INVALID "数据异常"
#define UI_TEXT_WAITING_FOR_DATA "等待数据"

#define UI_TEXT_EXAM_COUNTDOWN "考研倒计时"
#define UI_TEXT_MEMORY "内存"
#define UI_TEXT_NO_SYSTEM_METRICS "未启用系统指标"
#define UI_TEXT_CONNECTION_DETAILS "连接详情"
#define UI_TEXT_TAP_STATUS_TO_RETURN "再次点击状态返回"
#define UI_TEXT_COUNTDOWN_DISABLED "倒计时已关闭"
#define UI_TEXT_NO_VISIBLE_METRICS "没有可显示的指标\n请在网页中调整"
#define UI_TEXT_DAY "天"
#define UI_TEXT_TARGET_REACHED "目标时间已到"
#define UI_TEXT_OFFLINE_ESTIMATE "离线估算"

#define UI_TEXT_PAGE_OVERVIEW "总览"
#define UI_TEXT_PAGE_SYSTEM "系统"
#define UI_TEXT_PAGE_STUDY "学习"

#define UI_TEXT_MOTION_FULL "动效已开启"
#define UI_TEXT_MOTION_REDUCED "动效已简化"
#define UI_TEXT_MOTION_HINT "长按状态切换动效"

/* The Web and Hub title validators use the same fixed glyph subset. */
#define UI_TEXT_SUPPORTED_TITLE_GLYPHS \
    "监控屏连接中已在线重离正启刚更新数据延迟过期暂无异常等待考研倒计时" \
    "内存未用系统指标详情再次点击状态返回关闭没有可显示的请网页调整天目标间到" \
    "估算总览学习"
