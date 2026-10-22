import type { ThemeConfig } from 'antd';

// Gold taken from the Walnut logo. GOLD is the brand accent; PRIMARY is a deeper step so white button text stays readable.
export const GOLD = '#B8860B';
export const PRIMARY = '#94690A';
export const ESPRESSO = '#1D1A15';
export const SERIES = { gold: '#B8860B', blue: '#2a78d6' }; // validated 2-series chart palette (CVD-safe)
export const INK = { primary: '#1F1D1A', secondary: '#5C5953', muted: '#8A867E', grid: '#ECEAE4', axis: '#D4D1C8' };

export const theme: ThemeConfig = {
  token: {
    colorPrimary: PRIMARY,
    colorInfo: PRIMARY,
    colorLink: PRIMARY,
    colorSuccess: '#2E8B57',
    colorWarning: '#D48806',
    colorError: '#C8372D',
    borderRadius: 8,
    colorBgLayout: '#F5F4F0',
    colorBorderSecondary: '#ECEAE4',
    colorText: INK.primary,
    colorTextSecondary: INK.secondary,
    fontFamily: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
  components: {
    Layout: { siderBg: ESPRESSO, headerBg: '#FFFFFF', headerHeight: 60, headerPadding: '0 20px' },
    Menu: {
      darkItemBg: ESPRESSO, darkSubMenuItemBg: '#16140F', darkItemSelectedBg: 'rgba(184,134,11,0.22)', darkItemSelectedColor: '#F0C45C',
      darkItemColor: '#BDB6A6', darkItemHoverColor: '#FFFFFF', darkGroupTitleColor: '#7D7666', itemHeight: 38, groupTitleFontSize: 11,
    },
    Card: { headerFontSize: 15 },
    Table: { headerBg: '#FAF9F6', headerColor: INK.secondary, rowHoverBg: '#FBF7EC' },
    Tabs: { itemSelectedColor: PRIMARY, inkBarColor: PRIMARY },
    Segmented: { itemSelectedBg: '#FFFFFF' },
  },
};
