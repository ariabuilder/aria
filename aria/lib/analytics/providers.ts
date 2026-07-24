import {
  ANALYTICS_PROVIDER_IDS,
  type AnalyticsProviderId,
} from "../storage/adapter";

export { ANALYTICS_PROVIDER_IDS };

export type AnalyticsFieldType = "text" | "url";

export interface AnalyticsProviderField {
  key: string;
  label: string;
  type: AnalyticsFieldType;
  required: boolean;
  placeholder?: string;
  pattern?: string;
}

export interface CompiledProviderScripts {
  head: string[];
  bodyStart: string[];
  bodyEnd: string[];
  csp: AnalyticsProviderCspRequirements;
}

export interface AnalyticsProviderCspRequirements {
  scriptSrc: string[];
  connectSrc: string[];
  imgSrc: string[];
  frameSrc: string[];
  styleSrc: string[];
  fontSrc: string[];
  mediaSrc: string[];
  usesInlineScript: boolean;
  usesInlineStyle: boolean;
}

export interface AnalyticsProviderDefinition {
  id: AnalyticsProviderId;
  label: string;
  docsUrl?: string;
  fields: AnalyticsProviderField[];
  buildScripts: (fields: Record<string, string>) => CompiledProviderScripts;
}

function getUrlOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function createProviderCsp(
  overrides: Partial<AnalyticsProviderCspRequirements> = {},
): AnalyticsProviderCspRequirements {
  return {
    scriptSrc: overrides.scriptSrc ?? [],
    connectSrc: overrides.connectSrc ?? [],
    imgSrc: overrides.imgSrc ?? [],
    frameSrc: overrides.frameSrc ?? [],
    styleSrc: overrides.styleSrc ?? [],
    fontSrc: overrides.fontSrc ?? [],
    mediaSrc: overrides.mediaSrc ?? [],
    usesInlineScript: overrides.usesInlineScript ?? false,
    usesInlineStyle: overrides.usesInlineStyle ?? false,
  };
}

export const ANALYTICS_PROVIDERS: readonly AnalyticsProviderDefinition[] = [
  {
    id: "plausible",
    label: "Plausible",
    docsUrl: "https://plausible.io/docs",
    fields: [
      {
        key: "domain",
        label: "Domain",
        type: "text",
        required: true,
        placeholder: "example.com",
      },
      {
        key: "scriptSrc",
        label: "Script URL (optional)",
        type: "url",
        required: false,
        placeholder: "https://plausible.io/js/script.js",
      },
    ],
    buildScripts: (fields) => {
      const scriptSrc = fields.scriptSrc || "https://plausible.io/js/script.js";

      return {
        head: [
          `<script defer data-domain="${fields.domain}" src="${scriptSrc}"></script>`,
        ],
        bodyStart: [],
        bodyEnd: [],
        csp: createProviderCsp({
          scriptSrc: [getUrlOrigin(scriptSrc)].filter(
            (value): value is string => Boolean(value),
          ),
        }),
      };
    },
  },
  {
    id: "fathom",
    label: "Fathom",
    docsUrl: "https://usefathom.com/docs",
    fields: [
      {
        key: "siteId",
        label: "Site ID",
        type: "text",
        required: true,
        placeholder: "ABCDE",
      },
      {
        key: "scriptSrc",
        label: "Script URL (optional)",
        type: "url",
        required: false,
        placeholder: "https://cdn.usefathom.com/script.js",
      },
    ],
    buildScripts: (fields) => {
      const scriptSrc =
        fields.scriptSrc || "https://cdn.usefathom.com/script.js";

      return {
        head: [
          `<script src="${scriptSrc}" data-site="${fields.siteId}" defer></script>`,
        ],
        bodyStart: [],
        bodyEnd: [],
        csp: createProviderCsp({
          scriptSrc: [getUrlOrigin(scriptSrc)].filter(
            (value): value is string => Boolean(value),
          ),
        }),
      };
    },
  },
  {
    id: "simple-analytics",
    label: "Simple Analytics",
    docsUrl: "https://docs.simpleanalytics.com/script",
    fields: [
      {
        key: "scriptSrc",
        label: "Script URL (optional)",
        type: "url",
        required: false,
        placeholder: "https://scripts.simpleanalyticscdn.com/latest.js",
      },
    ],
    buildScripts: (fields) => {
      const scriptSrc =
        fields.scriptSrc || "https://scripts.simpleanalyticscdn.com/latest.js";

      return {
        head: [`<script async src="${scriptSrc}"></script>`],
        bodyStart: [],
        bodyEnd: [],
        csp: createProviderCsp({
          scriptSrc: [getUrlOrigin(scriptSrc)].filter(
            (value): value is string => Boolean(value),
          ),
        }),
      };
    },
  },
  {
    id: "matomo",
    label: "Matomo",
    docsUrl: "https://matomo.org/help/",
    fields: [
      {
        key: "baseUrl",
        label: "Matomo URL",
        type: "url",
        required: true,
        placeholder: "https://analytics.example.com/",
      },
      {
        key: "siteId",
        label: "Site ID",
        type: "text",
        required: true,
        placeholder: "1",
        pattern: "^[0-9]+$",
      },
    ],
    buildScripts: (fields) => {
      const baseUrl = fields.baseUrl.endsWith("/")
        ? fields.baseUrl
        : `${fields.baseUrl}/`;

      return {
        head: [
          `<script>var _paq=window._paq=window._paq||[];_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);(function(){var u='${baseUrl}';_paq.push(['setTrackerUrl',u+'matomo.php']);_paq.push(['setSiteId','${fields.siteId}']);var d=document,g=d.createElement('script'),s=d.getElementsByTagName('script')[0];g.async=true;g.src=u+'matomo.js';s.parentNode.insertBefore(g,s);})();</script>`,
        ],
        bodyStart: [],
        bodyEnd: [],
        csp: createProviderCsp({
          scriptSrc: [getUrlOrigin(baseUrl)].filter((value): value is string =>
            Boolean(value),
          ),
          connectSrc: [getUrlOrigin(baseUrl)].filter((value): value is string =>
            Boolean(value),
          ),
          usesInlineScript: true,
        }),
      };
    },
  },
  {
    id: "umami",
    label: "Umami",
    docsUrl: "https://umami.is/docs/tracker-configuration",
    fields: [
      {
        key: "websiteId",
        label: "Website ID",
        type: "text",
        required: true,
        placeholder: "94db1cb1-74f4-4a40-ad6c-962362670409",
        pattern:
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
      },
      {
        key: "scriptSrc",
        label: "Script URL (optional)",
        type: "url",
        required: false,
        placeholder: "https://cloud.umami.is/script.js",
      },
      {
        key: "hostUrl",
        label: "Host URL (optional)",
        type: "url",
        required: false,
        placeholder: "https://stats.example.com",
      },
    ],
    buildScripts: (fields) => {
      const scriptSrc = fields.scriptSrc || "https://cloud.umami.is/script.js";
      const connectOrigin =
        getUrlOrigin(fields.hostUrl) ?? getUrlOrigin(scriptSrc);

      return {
        head: [
          `<script defer src="${scriptSrc}" data-website-id="${fields.websiteId}"${fields.hostUrl ? ` data-host-url="${fields.hostUrl}"` : ""}></script>`,
        ],
        bodyStart: [],
        bodyEnd: [],
        csp: createProviderCsp({
          scriptSrc: [getUrlOrigin(scriptSrc)].filter(
            (value): value is string => Boolean(value),
          ),
          connectSrc: [connectOrigin].filter((value): value is string =>
            Boolean(value),
          ),
        }),
      };
    },
  },
  {
    id: "tiktok-pixel",
    label: "TikTok Pixel",
    docsUrl: "https://ads.tiktok.com/help/",
    fields: [
      {
        key: "pixelId",
        label: "Pixel ID",
        type: "text",
        required: true,
        placeholder: "TikTok Pixel ID",
        pattern: "^[0-9A-Za-z]{8,32}$",
      },
    ],
    buildScripts: (fields) => ({
      head: [
        `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load("${fields.pixelId}");ttq.page();}(window,document,"ttq");</script>`,
      ],
      bodyStart: [],
      bodyEnd: [],
      csp: createProviderCsp({
        scriptSrc: ["https://analytics.tiktok.com"],
        usesInlineScript: true,
      }),
    }),
  },
  {
    id: "linkedin-insight-tag",
    label: "LinkedIn Insight Tag",
    docsUrl: "https://www.linkedin.com/help/lms/answer/a427660",
    fields: [
      {
        key: "partnerId",
        label: "Partner ID",
        type: "text",
        required: true,
        placeholder: "123456",
        pattern: "^[0-9]+$",
      },
    ],
    buildScripts: (fields) => ({
      head: [
        `<script type="text/javascript">_linkedin_partner_id="${fields.partnerId}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);</script>`,
        `<script type="text/javascript">(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);</script>`,
      ],
      bodyStart: [
        `<noscript><img height="1" width="1" style="display:none;" alt="" src="https://px.ads.linkedin.com/collect/?pid=${fields.partnerId}&fmt=gif" /></noscript>`,
      ],
      bodyEnd: [],
      csp: createProviderCsp({
        scriptSrc: ["https://snap.licdn.com"],
        imgSrc: ["https://px.ads.linkedin.com"],
        usesInlineScript: true,
      }),
    }),
  },
  {
    id: "meta-pixel",
    label: "Meta / Facebook Pixel",
    docsUrl: "https://developers.facebook.com/docs/meta-pixel",
    fields: [
      {
        key: "pixelId",
        label: "Pixel ID",
        type: "text",
        required: true,
        placeholder: "123456789012345",
        pattern: "^[0-9]{8,20}$",
      },
    ],
    buildScripts: (fields) => ({
      head: [
        `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fields.pixelId}');fbq('track','PageView');</script>`,
      ],
      bodyStart: [
        `<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${fields.pixelId}&ev=PageView&noscript=1" /></noscript>`,
      ],
      bodyEnd: [],
      csp: createProviderCsp({
        scriptSrc: ["https://connect.facebook.net"],
        imgSrc: ["https://www.facebook.com"],
        usesInlineScript: true,
      }),
    }),
  },
  {
    id: "google-analytics",
    label: "Google Analytics (GA4)",
    docsUrl: "https://developers.google.com/analytics/devguides/collection/ga4",
    fields: [
      {
        key: "measurementId",
        label: "Measurement ID",
        type: "text",
        required: true,
        placeholder: "G-XXXXXXXXXX",
        pattern: "^G-[A-Z0-9]+$",
      },
    ],
    buildScripts: (fields) => ({
      head: [
        `<script async src="https://www.googletagmanager.com/gtag/js?id=${fields.measurementId}"></script>`,
        `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${fields.measurementId}');</script>`,
      ],
      bodyStart: [],
      bodyEnd: [],
      csp: createProviderCsp({
        scriptSrc: ["https://www.googletagmanager.com"],
        connectSrc: ["https://*.google-analytics.com"],
        usesInlineScript: true,
      }),
    }),
  },
  {
    id: "google-tag-manager",
    label: "Google Tag Manager",
    docsUrl: "https://support.google.com/tagmanager/",
    fields: [
      {
        key: "containerId",
        label: "Container ID",
        type: "text",
        required: true,
        placeholder: "GTM-XXXXXXX",
        pattern: "^GTM-[A-Z0-9]+$",
      },
    ],
    buildScripts: (fields) => ({
      head: [
        `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${fields.containerId}');</script>`,
      ],
      bodyStart: [
        `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${fields.containerId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
      ],
      bodyEnd: [],
      csp: createProviderCsp({
        scriptSrc: ["https://www.googletagmanager.com"],
        frameSrc: ["https://www.googletagmanager.com"],
        usesInlineScript: true,
      }),
    }),
  },
] as const;

export const ANALYTICS_PROVIDER_MAP: Readonly<
  Record<AnalyticsProviderId, AnalyticsProviderDefinition>
> = ANALYTICS_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = provider;
    return acc;
  },
  {} as Record<AnalyticsProviderId, AnalyticsProviderDefinition>,
);
