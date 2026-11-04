/**
 * @file command.c
 * @brief Console command parser (see command.h).
 *
 * Grammar:  line := blank | '!' word [ws number] | at-line
 */
#include "core/command.h"

#include <ctype.h>
#include <stdbool.h>
#include <string.h>

#include "core/accel.h"

/** Maps a command word to its kind and whether it takes a threshold. */
typedef struct {
    const char *word;
    gd_command_kind_t kind;
    bool takes_threshold;
} command_entry_t;

static const command_entry_t COMMANDS[] = {
    {"help", GD_CMD_HELP, false},     {"diag", GD_CMD_DIAG, false},
    {"gnss", GD_CMD_GNSS, false},     {"lis", GD_CMD_SENSOR, false},
    {"arm", GD_CMD_ARM, true},        {"sleep", GD_CMD_SLEEP, true},
    {"vbat", GD_CMD_BATTERY, false},
};

static const char *skip_spaces(const char *p)
{
    while (*p && isspace((unsigned char)*p)) p++;
    return p;
}

/** Length of the token at @p p (up to whitespace or end). */
static size_t token_length(const char *p)
{
    size_t n = 0;
    while (p[n] && !isspace((unsigned char)p[n])) n++;
    return n;
}

static bool token_equals(const char *token, size_t length, const char *word)
{
    return strlen(word) == length && strncmp(token, word, length) == 0;
}

/** Parse an unsigned decimal token. Rejects empty, signs and overflow past 5 digits. */
static bool parse_number(const char *token, size_t length, uint32_t *out)
{
    if (length == 0 || length > 5) return false;
    uint32_t value = 0;
    for (size_t i = 0; i < length; i++) {
        if (!isdigit((unsigned char)token[i])) return false;
        value = value * 10u + (uint32_t)(token[i] - '0');
    }
    *out = value;
    return true;
}

static gd_command_t make(gd_command_kind_t kind, const char *text)
{
    gd_command_t cmd = {.kind = kind, .threshold_mg = GD_MOTION_THRESHOLD_DEFAULT_MG, .text = text};
    return cmd;
}

/** Parse the optional threshold argument and require nothing after it. */
static gd_command_t with_threshold(gd_command_kind_t kind, const char *rest)
{
    rest = skip_spaces(rest);
    if (*rest == '\0') return make(kind, NULL);
    const size_t length = token_length(rest);
    uint32_t value = 0;
    if (!parse_number(rest, length, &value) || *skip_spaces(rest + length) != '\0') {
        return make(GD_CMD_INVALID_ARGUMENT, rest);
    }
    gd_command_t cmd = make(kind, NULL);
    cmd.threshold_mg = gd_motion_threshold_clamp(value);
    return cmd;
}

/** "!modem on" / "!modem off". */
static gd_command_t parse_modem(const char *rest)
{
    rest = skip_spaces(rest);
    const size_t length = token_length(rest);
    if (*skip_spaces(rest + length) != '\0') return make(GD_CMD_INVALID_ARGUMENT, rest);
    if (token_equals(rest, length, "on")) return make(GD_CMD_MODEM_ON, NULL);
    if (token_equals(rest, length, "off")) return make(GD_CMD_MODEM_OFF, NULL);
    return make(GD_CMD_INVALID_ARGUMENT, rest);
}

static gd_command_t parse_local(const char *word)
{
    const size_t length = token_length(word);
    const char *rest = word + length;
    if (length == 0) return make(GD_CMD_HELP, NULL);
    if (token_equals(word, length, "modem")) return parse_modem(rest);
    for (size_t i = 0; i < sizeof(COMMANDS) / sizeof(COMMANDS[0]); i++) {
        if (!token_equals(word, length, COMMANDS[i].word)) continue;
        if (COMMANDS[i].takes_threshold) return with_threshold(COMMANDS[i].kind, rest);
        if (*skip_spaces(rest) != '\0') return make(GD_CMD_INVALID_ARGUMENT, skip_spaces(rest));
        return make(COMMANDS[i].kind, NULL);
    }
    return make(GD_CMD_UNKNOWN, word);
}

gd_command_t gd_command_parse(const char *line)
{
    const char *start = skip_spaces(line);
    if (*start == '\0') return make(GD_CMD_EMPTY, NULL);
    if (*start == '!') return parse_local(skip_spaces(start + 1));
    return make(GD_CMD_AT_PASSTHROUGH, start);
}
