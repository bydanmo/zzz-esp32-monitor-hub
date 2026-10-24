#pragma once

#include "display_config.h"
#include "ui_model.h"

void ui_shell_create(void);
void ui_shell_apply_config(const monitor_display_config_t *config);
void ui_shell_update(const ui_model_t *model);
