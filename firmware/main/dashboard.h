#pragma once

#include "display_config.h"
#include "ui/ui_model.h"

void dashboard_create(void);
void dashboard_update(const ui_model_t *model);
void dashboard_apply_config(const monitor_display_config_t *config);
