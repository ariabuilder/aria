/**
 * GraphQL query documents for zone HTTP analytics.
 */

export const ZONE_HTTP_TOTALS_QUERY = `
  query ZoneHttpTotals($zoneTag: string!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        totals: httpRequestsAdaptiveGroups(limit: 1, filter: $filter) {
          count
          sum {
            visits
            edgeResponseBytes
          }
        }
      }
    }
  }
`;

export const ZONE_HTTP_BY_PATH_QUERY = `
  query ZoneHttpByPath($zoneTag: string!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        paths: httpRequestsAdaptiveGroups(
          limit: 1000
          orderBy: [sum_visits_DESC]
          filter: $filter
        ) {
          sum {
            visits
          }
          dimensions {
            clientRequestPath
          }
        }
      }
    }
  }
`;

export const ZONE_HTTP_BY_HOUR_QUERY = `
  query ZoneHttpByHour($zoneTag: string!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        series: httpRequestsAdaptiveGroups(
          limit: 500
          orderBy: [datetimeHour_ASC]
          filter: $filter
        ) {
          count
          sum {
            visits
            edgeResponseBytes
          }
          dimensions {
            datetimeHour
          }
        }
      }
    }
  }
`;

export type ZoneTotalsGroup = {
  count?: number;
  sum?: {
    visits?: number;
    edgeResponseBytes?: number;
  };
};

export type ZonePathGroup = {
  sum?: { visits?: number };
  dimensions?: { clientRequestPath?: string };
};

export type ZoneHourGroup = {
  count?: number;
  sum?: { visits?: number; edgeResponseBytes?: number };
  dimensions?: { datetimeHour?: string };
};

export type ZoneTotalsQueryResult = {
  viewer?: {
    zones?: Array<{
      totals?: ZoneTotalsGroup[];
    }>;
  };
};

export type ZonePathsQueryResult = {
  viewer?: {
    zones?: Array<{
      paths?: ZonePathGroup[];
    }>;
  };
};

export type ZoneHourlyQueryResult = {
  viewer?: {
    zones?: Array<{
      series?: ZoneHourGroup[];
    }>;
  };
};
