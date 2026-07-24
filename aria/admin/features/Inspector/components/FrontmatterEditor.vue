<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  FieldSchema,
  FrontmatterSchema,
  PageFrontmatter,
} from "../../lib/schemas/frontmatter";
import { validateFrontmatter } from "../../lib/schemas/frontmatter";
import {
  frontmatterSchemaToZod,
  validateFrontmatterWithZod,
} from "../../lib/schemas/frontmatter";

interface Props {
  frontmatter?: PageFrontmatter;
  schema: FrontmatterSchema;
}

interface Emits {
  (e: "update:frontmatter", value: PageFrontmatter): void;
}

const props = withDefaults(defineProps<Props>(), {
  frontmatter: () => ({}),
});

const emit = defineEmits<Emits>();

const formData = ref<PageFrontmatter>({
  ...props.frontmatter,
});

const errors = ref<Record<string, string>>({});
const touched = ref<Set<string>>(new Set());

// Zod schema for current frontmatter schema
const zodSchema = computed(() => frontmatterSchemaToZod(props.schema));

const getFieldDef = (fieldName: string) => {
  return props.schema[fieldName];
};

// Zod-based validation for a single field
const validateField = (fieldName: string) => {
  touched.value.add(fieldName);
  const partialData = { [fieldName]: formData.value[fieldName] };
  const partialSchema = frontmatterSchemaToZod({
    [fieldName]: props.schema[fieldName],
  });
  const result = partialSchema.safeParse(partialData);

  if (!result.success) {
    const issues = result.error.issues;
    errors.value[fieldName] = issues.length
      ? issues[0].message
      : "Invalid value";
    return false;
  }

  errors.value[fieldName] = "";
  return true;
};

// Zod-based validation for all fields
const validateAll = () => {
  const result = validateFrontmatterWithZod(props.schema, formData.value);
  if (!result.success) {
    // Flatten Zod errors for display
    const formatted = result.error.format();
    Object.keys(props.schema).forEach((field) => {
      errors.value[field] = formatted[field]?._errors?.[0] || "";
    });
  } else {
    Object.keys(props.schema).forEach((field) => {
      errors.value[field] = "";
    });
  }
  return result.success;
};

// Computed: whether form is valid
const isValid = computed(() => {
  return validateAll();
});

const handleInput = (fieldName: string, value: unknown) => {
  formData.value[fieldName] = value;
  if (touched.value.has(fieldName)) {
    validateField(fieldName);
  }
  emit("update:frontmatter", formData.value);
};

const handleBlur = (fieldName: string) => {
  validateField(fieldName);
};

// Get value for field
const getValue = (fieldName: string, fieldDef: FieldSchema) => {
  return formData.value[fieldName] ?? fieldDef.default ?? "";
};

const getArrayValue = (fieldName: string) => {
  const value = formData.value[fieldName];
  return Array.isArray(value) ? value.join(", ") : "";
};

const handleArrayInput = (fieldName: string, input: string) => {
  const values = input
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s);
  handleInput(fieldName, values);
};

const errorCount = computed(() => Object.keys(errors.value).length);
</script>

<template>
  <div
    class="flex flex-col h-full overflow-y-auto transition-colors"
    :style="{
      background: 'var(--color-sidebar)',
      borderLeft: '1px solid var(--color-border)',
    }"
  >
    <!-- Header -->
    <div
      class="sticky top-0 px-4 py-3 transition-colors"
      :style="{
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-sidebar)',
      }"
    >
      <h3 class="font-semibold text-sm" :style="{ color: 'var(--color-text)' }">
        Page Settings
      </h3>
      <p class="text-xs mt-1" :style="{ color: 'var(--color-muted)' }">
        Configure page metadata and frontmatter
      </p>
    </div>

    <!-- Form -->
    <div class="flex-1 px-4 py-4 space-y-6">
      <!-- Each field in schema -->
      <div
        v-for="[fieldName, fieldDef] in Object.entries(schema)"
        :key="fieldName"
        class="space-y-2"
      >
        <!-- Label -->
        <label
          class="block text-sm font-medium"
          :style="{ color: 'var(--color-text)' }"
        >
          {{ fieldDef.label }}
          <span v-if="fieldDef.required" class="text-red-500 ml-1">*</span>
        </label>

        <!-- Input Fields -->
        <div class="relative">
          <!-- Text Input or Select -->
          <select
            v-if="fieldDef.type === 'string' && fieldDef.options"
            :value="getValue(fieldName, fieldDef)"
            @input="
              (e) =>
                handleInput(fieldName, (e.target as HTMLSelectElement).value)
            "
            @blur="handleBlur(fieldName)"
            class="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none"
            :style="{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }"
          >
            <option value="">Select {{ fieldDef.label }}</option>
            <option
              v-for="opt in fieldDef.options"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>

          <input
            v-else-if="fieldDef.type === 'string'"
            type="text"
            :value="getValue(fieldName, fieldDef)"
            :placeholder="fieldDef.placeholder || ''"
            @input="
              (e) =>
                handleInput(fieldName, (e.target as HTMLInputElement).value)
            "
            @blur="handleBlur(fieldName)"
            class="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none"
            :style="{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }"
          />

          <input
            v-else-if="fieldDef.type === 'number'"
            type="number"
            :value="getValue(fieldName, fieldDef)"
            @input="
              (e) =>
                handleInput(
                  fieldName,
                  parseInt((e.target as HTMLInputElement).value) || 0,
                )
            "
            @blur="handleBlur(fieldName)"
            class="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none"
            :style="{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }"
          />

          <input
            v-else-if="fieldDef.type === 'date'"
            type="date"
            :value="getValue(fieldName, fieldDef)"
            @input="
              (e) =>
                handleInput(fieldName, (e.target as HTMLInputElement).value)
            "
            @blur="handleBlur(fieldName)"
            class="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none"
            :style="{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }"
          />

          <input
            v-else-if="fieldDef.type === 'array'"
            type="text"
            :value="getArrayValue(fieldName)"
            placeholder="Enter values separated by commas"
            @input="
              (e) =>
                handleArrayInput(
                  fieldName,
                  (e.target as HTMLInputElement).value,
                )
            "
            @blur="handleBlur(fieldName)"
            class="w-full px-3 py-2 border rounded-md text-sm transition-colors focus:outline-none"
            :style="{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }"
          />

          <label
            v-else-if="fieldDef.type === 'boolean'"
            class="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="getValue(fieldName, fieldDef)"
              @change="
                (e) =>
                  handleInput(fieldName, (e.target as HTMLInputElement).checked)
              "
              class="w-4 h-4"
            />
            <span class="text-sm" :style="{ color: 'var(--color-text)' }">{{
              fieldDef.label
            }}</span>
          </label>

          <div v-else class="text-sm" :style="{ color: 'var(--color-muted)' }">
            Unsupported field type
          </div>

          <!-- Error message -->
          <p
            v-if="touched.has(fieldName) && errors[fieldName]"
            class="mt-1 text-xs text-red-500 flex items-center gap-1"
          >
            <span>⚠</span>
            {{ errors[fieldName] }}
          </p>
        </div>

        <!-- Help text -->
        <p
          v-if="fieldDef.description"
          class="text-xs"
          :style="{ color: 'var(--color-muted)' }"
        >
          {{ fieldDef.description }}
        </p>

        <p
          v-if="fieldDef.help"
          class="text-xs rounded px-2 py-1"
          :style="{
            color: 'var(--color-faint)',
            background: 'var(--color-hover)',
          }"
        >
          💡 {{ fieldDef.help }}
        </p>
      </div>
    </div>

    <!-- Footer with status -->
    <div
      class="sticky bottom-0 px-4 py-3 transition-colors"
      :style="{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-sidebar)',
      }"
    >
      <div
        v-if="isValid"
        class="flex items-center gap-2 text-xs text-green-600"
      >
        <span>✓</span>
        <span>All fields valid</span>
      </div>
      <div v-else class="flex items-center gap-2 text-xs text-amber-600">
        <span>⚠</span>
        <span>{{ errorCount }} error{{ errorCount !== 1 ? "s" : "" }}</span>
      </div>
    </div>
  </div>
</template>
