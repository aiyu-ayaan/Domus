package com.atech.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

/** Mirrors `backend/automations/schemas.py`. */

@Serializable
data class Trigger(
    val type: TriggerType,
    val device_id: String? = null,
    val state: String? = null,
    val at: String? = null,
)

@Serializable
data class Condition(
    val field: String,
    val op: ConditionOp,
    val value: JsonElement = JsonNull,
)

@Serializable
data class Action(
    val type: ActionType,
    val device_id: String? = null,
    val title: String? = null,
    val body: String? = null,
)

@Serializable
data class Automation(
    val id: String,
    val home_id: String,
    val name: String,
    val enabled: Boolean,
    val trigger: Trigger,
    val conditions: List<Condition> = emptyList(),
    val actions: List<Action> = emptyList(),
    val last_triggered_at: String? = null,
    val last_error: String? = null,
    val created_at: String,
)

@Serializable
data class AutomationCreate(
    val home_id: String,
    val name: String,
    val enabled: Boolean = true,
    val trigger: Trigger,
    val conditions: List<Condition> = emptyList(),
    val actions: List<Action>,
)

@Serializable
data class AutomationUpdate(
    val name: String? = null,
    val enabled: Boolean? = null,
    val trigger: Trigger? = null,
    val conditions: List<Condition>? = null,
    val actions: List<Action>? = null,
)

@Serializable
data class AutomationRunResult(
    val automation_id: String,
    val matched: Boolean,
    val executed: Boolean,
    val error: String? = null,
)
