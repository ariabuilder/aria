<script setup lang="ts">
import { RouterLink } from "vue-router"
import {
  Breadcrumb as BreadcrumbNav,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface Props {
  items: BreadcrumbItem[]
}

defineProps<Props>()
</script>

<template>
  <BreadcrumbNav>
    <BreadcrumbList>
      <template v-for="(item, index) in items" :key="index">
        <BreadcrumbItem>
          <BreadcrumbLink
            v-if="item.href && index < items.length - 1"
            as-child
          >
            <RouterLink :to="item.href">
              {{ item.label }}
            </RouterLink>
          </BreadcrumbLink>
          <BreadcrumbPage v-else class="truncate">
            {{ item.label }}
          </BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="index < items.length - 1" />
      </template>
    </BreadcrumbList>
  </BreadcrumbNav>
</template>
