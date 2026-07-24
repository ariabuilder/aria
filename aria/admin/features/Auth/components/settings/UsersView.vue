<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studioIcons } from "@/lib/icons";
import type { BootstrapUserId, User, UserRole } from "@/lib/auth/types";
import { canDeleteUserInSettings } from "@/lib/auth/bootstrapUser";
import {
  unwrapAuthSuccessResult,
  unwrapAuthUserMutationResult,
  unwrapAuthUsersListResult,
} from "../../composables/authSettingsActionResults";
import UsersCreateDialog from "./dialogs/UsersCreateDialog.vue";
import UsersDeleteDialog from "./dialogs/UsersDeleteDialog.vue";
import UserDetailView from "./UserDetailView.vue";
import {
  syncSessionUserIfSelf,
  isSessionUserId,
} from "../../composables/useUser";
import { useSettingsDialog } from "@/features/Studio/settings/composables/useSettingsDialog";
import { useStudioI18n } from "@/i18n";

const settingsDialog = useSettingsDialog();
const { t, locale } = useStudioI18n();

const users = ref<User[]>([]);
const bootstrapUserId = ref<BootstrapUserId | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedUser = ref<User | null>(null);

const showCreateDialog = ref(false);
const createLoading = ref(false);
const createForm = ref({
  name: "",
  username: "",
  email: "",
  password: "",
  role: "content-editor" as UserRole,
});
const createError = ref<string | null>(null);

const showDeleteDialog = ref(false);
const deleteLoading = ref(false);
const userToDelete = ref<User | null>(null);

function canDeleteUser(user: User): boolean {
  return canDeleteUserInSettings(user, users.value, bootstrapUserId.value);
}

async function loadUsers() {
  loading.value = true;
  error.value = null;
  try {
    const { data, error: actionError } = await actions.auth.listUsers();
    const result = unwrapAuthUsersListResult(
      { data, error: actionError },
      { source: "UsersView.loadUsers" },
    );
    if (!result.success) {
      error.value = result.error;
      return;
    }

    users.value = result.data.users;
    bootstrapUserId.value = result.data.bootstrapUserId;
    resolveSelectedUserFromId();
  } catch (e) {
    error.value = t("users.loadFailed");
  } finally {
    loading.value = false;
  }
}

function formatAuthError(raw: string): string {
  if (raw.startsWith("Failed to validate:")) {
    try {
      const json = raw.slice("Failed to validate:".length).trim();
      const issues = JSON.parse(json) as Array<{ message: string } | undefined>;
      if (Array.isArray(issues) && issues[0]?.message) {
        return issues[0].message;
      }
    } catch {
      /* fall through */
    }
  }
  // Collapse multiple spaces/newlines for cleaner display
  return raw.replace(/\s+/g, " ").trim();
}

function handleUserUpdate(updated: User): void {
  const idx = users.value.findIndex((x) => x.id === updated.id);
  if (idx >= 0) {
    users.value[idx] = updated;
  }
  selectedUser.value = updated;

  if (!isSessionUserId(updated.id)) {
    return;
  }

  syncSessionUserIfSelf({
    id: updated.id,
    avatarUrl: updated.avatarUrl ?? null,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    totpEnabled: updated.totpEnabled,
    permissionProfile: updated.permissionProfile,
  });
  settingsDialog.markSessionProfileDirty();
}

function resolveSelectedUserFromId(): void {
  const id = settingsDialog.selectedUserId.value;
  if (!id || users.value.length === 0) return;

  const match = users.value.find((u) => u.id === id);
  if (!match) return;

  selectedUser.value = match;
  settingsDialog.selectedUserId.value = null;
}

watch(
  () => settingsDialog.selectedUserId.value,
  () => resolveSelectedUserFromId(),
  { immediate: true },
);

watch(users, () => resolveSelectedUserFromId(), { immediate: true });

watch(selectedUser, (user) => settingsDialog.setHeaderOverride(user !== null), {
  immediate: true,
});

onUnmounted(() => settingsDialog.setHeaderOverride(false));

async function createUser() {
  createLoading.value = true;
  createError.value = null;
  try {
    const { data, error } = await actions.auth.createUser({
      name: createForm.value.name,
      username: createForm.value.username,
      email: createForm.value.email,
      password: createForm.value.password,
      role: createForm.value.role,
    });
    const result = unwrapAuthUserMutationResult(
      { data, error },
      t("users.createFailed"),
      "[AuthSettings] Invalid createUser response",
      { source: "UsersView.createUser" },
    );
    if (!result.success) {
      createError.value = formatAuthError(result.error);
      return;
    }

    showCreateDialog.value = false;
    createForm.value = {
      name: "",
      username: "",
      email: "",
      password: "",
      role: "content-editor",
    };
    await loadUsers();
  } catch (e) {
    createError.value = formatAuthError(
      e instanceof Error ? e.message : t("users.createFailed"),
    );
  } finally {
    createLoading.value = false;
  }
}

function openDeleteDialog(user: User) {
  if (!canDeleteUser(user)) {
    return;
  }
  userToDelete.value = user;
  showDeleteDialog.value = true;
}

async function deleteUser() {
  if (!userToDelete.value) return;
  deleteLoading.value = true;
  try {
    const { data, error: actionError } = await actions.auth.deleteUser({
      id: userToDelete.value.id,
    });
    const result = unwrapAuthSuccessResult(
      { data, error: actionError },
      t("users.deleteFailed"),
      "[AuthSettings] Invalid deleteUser response",
      { source: "UsersView.deleteUser", userId: userToDelete.value.id },
    );
    if (!result.success) {
      error.value = result.error;
      return;
    }

    showDeleteDialog.value = false;
    userToDelete.value = null;
    await loadUsers();
  } catch (e) {
    error.value = t("users.deleteFailed");
  } finally {
    deleteLoading.value = false;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return t("users.never");
  return new Date(dateStr).toLocaleDateString(
    locale.value === "fr" ? "fr-CA" : "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    administrator: t("users.administrator"),
    manager: t("users.manager"),
    "content-editor": t("users.contentEditor"),
    contributor: t("users.contributor"),
  };
  return labels[role];
}

onMounted(() => {
  loadUsers();
});
</script>

<template>
  <Teleport defer to="#settings-tab-actions">
    <Button
      @click="showCreateDialog = true"
      class="gap-2 shrink-0 w-full sm:w-auto"
    >
      {{ t("users.add") }}

      <span :class="[studioIcons.userPlus, 'size-4']" />
    </Button>
  </Teleport>
  <div class="space-y-4" role="form" :aria-label="t('users.settings')">
    <UserDetailView
      v-if="selectedUser"
      :user="selectedUser"
      :bootstrap-user-id="bootstrapUserId"
      :can-delete="canDeleteUser(selectedUser)"
      @back="selectedUser = null"
      @delete="
        userToDelete = $event;
        showDeleteDialog = true;
      "
      @update:user="handleUserUpdate"
    />

    <template v-else>
      <div
        class="flex flex-col sm:flex-row sm:items-start justify-between gap-3"
      >
        <div>
          <h3 class="text-md font-serif font-medium text-foreground leading-0">
            {{ t("users.title") }}
          </h3>
          <p class="text-sm text-muted-foreground mt-1">
            {{ t("users.description") }}
          </p>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <span
          :class="[
            studioIcons.refreshLine,
            'size-8 animate-spin text-muted-foreground',
          ]"
        />
      </div>

      <!-- Error State -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center py-20 gap-4"
      >
        <span
          :class="[studioIcons.dangerTriangle, 'size-12 text-destructive']"
        />
        <p class="text-sm text-destructive">{{ error }}</p>
        <Button variant="outline" @click="loadUsers">{{
          t("users.tryAgain")
        }}</Button>
      </div>

      <!-- Users Table -->
      <div
        v-else
        class="rounded-md border border-border/50 border-solid bg-background overflow-hidden animate-in fade-in duration-100 px-0"
      >
        <div class="overflow-x-auto">
          <Table class="border-collapse table-auto w-full">
            <TableHeader
              class="hover:bg-card/50! border-b border-border border-dashed bg-card/50!"
            >
              <TableRow class="">
                <TableHead
                  class="text-xs font-medium text-muted-foreground w-full"
                >
                  {{ t("users.user") }}
                </TableHead>
                <TableHead
                  class="text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {{ t("users.role") }}
                </TableHead>
                <TableHead
                  class="text-xs font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell"
                >
                  {{ t("users.lastLogin") }}
                </TableHead>
                <TableHead
                  class="text-xs font-medium text-muted-foreground w-px"
                >
                  <span class="sr-only">{{ t("users.actions") }}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="user in users"
                :key="user.id"
                class="group transition-colors hover:bg-muted/50 border-b border-border last:border-0"
              >
                <!-- User Info -->
                <TableCell
                  class="py-3 cursor-pointer"
                  @click="selectedUser = user"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      class="size-8 rounded-md overflow-hidden bg-card/30 border border-border shrink-0 hidden sm:flex items-center justify-center"
                    >
                      <img
                        v-if="user.avatarUrl"
                        :src="user.avatarUrl"
                        class="size-full object-cover"
                      />
                      <span
                        v-else
                        :class="[
                          studioIcons.user,
                          'size-4 text-muted-foreground/40',
                        ]"
                      />
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span
                        class="text-sm font-medium text-foreground truncate"
                        >{{ user.username }}</span
                      >
                      <span
                        class="text-xs lowercase text-muted-foreground truncate"
                        >{{ user.email || t("users.noEmail") }}</span
                      >
                    </div>
                  </div>
                </TableCell>

                <!-- Role Badge -->
                <TableCell class="whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <Badge variant="outline" class="gap-1 border-none pl-0">
                      {{
                        roleLabel(
                          user.permissionProfile?.rolePreset ?? user.role,
                        )
                      }}
                    </Badge>
                  </div>
                </TableCell>

                <!-- Last Login -->
                <TableCell
                  class="text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell"
                >
                  {{ formatDate(user.lastLoginAt) }}
                </TableCell>

                <!-- Actions -->
                <TableCell class="text-right">
                  <div
                    class="actions-cell opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          class="h-8 w-8 p-0"
                        >
                          <span
                            :class="[studioIcons.moreHorizontal, 'size-4.5']"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-40">
                        <DropdownMenuItem @click="selectedUser = user">
                          <span :class="[studioIcons.eye, 'size-3.5 mr-2']" />
                          {{ t("users.viewDetails") }}
                        </DropdownMenuItem>
                        <template v-if="canDeleteUser(user)">
                          <DropdownMenuItem
                            variant="destructive"
                            @click="openDeleteDialog(user)"
                          >
                            <span
                              :class="[studioIcons.trashBin, 'size-3.5 mr-2']"
                            />
                            {{ t("common.delete") }}
                          </DropdownMenuItem>
                        </template>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!loading && !error && users.length === 0"
        class="flex flex-col items-center justify-center py-20 gap-4"
      >
        <span
          :class="[studioIcons.userCircle, 'size-12 text-muted-foreground']"
        />
        <p class="text-sm text-muted-foreground">{{ t("users.empty") }}</p>
        <Button
          @click="showCreateDialog = true"
          variant="outline"
          class="gap-2"
        >
          <span :class="[studioIcons.userPlus, 'size-4']" />
          {{ t("users.addFirst") }}
        </Button>
      </div>
    </template>
  </div>

  <UsersCreateDialog
    v-model:open="showCreateDialog"
    v-model:form="createForm"
    :loading="createLoading"
    :error="createError"
    @submit="createUser"
  />

  <UsersDeleteDialog
    v-model:open="showDeleteDialog"
    :loading="deleteLoading"
    :user="userToDelete"
    :can-delete="Boolean(userToDelete && canDeleteUser(userToDelete))"
    @confirm="deleteUser"
  />
</template>

<style scoped>
.fade-enter {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Always show action buttons on touch devices (no hover state) */
@media (hover: none) {
  .actions-cell {
    opacity: 1 !important;
  }
}

/* Scrollable table wrapper: hide scrollbar on capable browsers */
.overflow-x-auto {
  scrollbar-width: none;
}
.overflow-x-auto::-webkit-scrollbar {
  display: none;
}
</style>
