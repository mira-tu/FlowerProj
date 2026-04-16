import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { adminAPI } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import { getPaymentStatusDisplay, getStatusColor, getStatusLabel } from '../adminHelpers';

const formatMonthKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateLabel = (dateKey) => {
  const normalized = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return 'Selected Date';
  }

  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime())
    ? normalized
    : parsed.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};

const parseDateKey = (dateKey) => {
  const normalized = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [yearText, monthText, dayText] = normalized.split('-').map(Number);
  const parsed = new Date(yearText, monthText - 1, dayText);

  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== yearText
    || parsed.getMonth() !== monthText - 1
    || parsed.getDate() !== dayText
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const getNormalizedRangeKeys = (startKey, endKey) => {
  const parsedStart = parseDateKey(startKey);
  const parsedEnd = parseDateKey(endKey);
  const fallbackDate = parsedStart || parsedEnd || new Date();
  const safeStart = parsedStart || fallbackDate;
  const safeEnd = parsedEnd || fallbackDate;

  if (safeStart <= safeEnd) {
    return {
      startKey: formatDateKey(safeStart),
      endKey: formatDateKey(safeEnd),
    };
  }

  return {
    startKey: formatDateKey(safeEnd),
    endKey: formatDateKey(safeStart),
  };
};

const getDateRangeLabel = (startKey, endKey) => {
  const { startKey: normalizedStartKey, endKey: normalizedEndKey } = getNormalizedRangeKeys(startKey, endKey);
  return normalizedStartKey === normalizedEndKey
    ? getDateLabel(normalizedStartKey)
    : `${getDateLabel(normalizedStartKey)} - ${getDateLabel(normalizedEndKey)}`;
};

const getRangeDetails = (startKey, endKey) => {
  const normalizedKeys = getNormalizedRangeKeys(startKey, endKey);
  const start = parseDateKey(normalizedKeys.startKey) || new Date();
  const inclusiveEnd = parseDateKey(normalizedKeys.endKey) || new Date(start);
  const end = new Date(inclusiveEnd);
  end.setDate(end.getDate() + 1);
  const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

  return {
    ...normalizedKeys,
    start,
    inclusiveEnd,
    end,
    totalDays,
  };
};

const getMonthRange = (monthKey) => {
  const normalizedKey = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalizedKey)) {
    return null;
  }

  const [yearText, monthText] = normalizedKey.split('-');
  const start = new Date(Number(yearText), Number(monthText) - 1, 1);
  const end = new Date(Number(yearText), Number(monthText), 1);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const getCalendarDays = (monthDate, maxDate = new Date()) => {
  const baseMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const month = baseMonth.getMonth();
  const leadingEmptyDays = (baseMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(baseMonth.getFullYear(), month + 1, 0).getDate();
  const totalCells = Math.ceil((leadingEmptyDays + daysInMonth) / 7) * 7;
  const calendarDays = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - leadingEmptyDays + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      calendarDays.push(null);
      continue;
    }

    const date = new Date(baseMonth.getFullYear(), month, dayNumber);
    date.setHours(0, 0, 0, 0);
    const maxSelectableDate = new Date(maxDate);
    maxSelectableDate.setHours(0, 0, 0, 0);

    calendarDays.push({
      key: formatDateKey(date),
      label: dayNumber,
      isDisabled: date > maxSelectableDate,
    });
  }

  return calendarDays;
};

const getWeekStartDate = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const dayOfWeek = normalized.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
};

const formatShortDateLabel = (date) => date.toLocaleDateString('en-PH', {
  month: 'short',
  day: 'numeric',
});

const createSparseChartLabels = (labels = [], maxVisibleLabels = 6) => {
  const safeLabels = Array.isArray(labels) ? labels : [];
  if (safeLabels.length <= maxVisibleLabels) {
    return safeLabels;
  }

  const step = Math.max(1, Math.ceil((safeLabels.length - 1) / Math.max(1, maxVisibleLabels - 1)));

  return safeLabels.map((label, index) => {
    const isFirst = index === 0;
    const isLast = index === safeLabels.length - 1;
    const isStepPoint = index % step === 0;
    return (isFirst || isLast || isStepPoint) ? label : '';
  });
};

const formatSalesAxisLabel = (value) => `₱${Math.round(Number(value) || 0)}`;

const getSaleAmountValue = (sale) => {
  const parsed = Number.parseFloat(sale?.total_amount);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildHourlySalesSeries = (sales = []) => {
  const labels = ['12AM', '4AM', '8AM', '12PM', '4PM', '8PM'];
  const data = Array(6).fill(0);

  sales.forEach((sale) => {
    const saleDate = new Date(sale.sale_date);
    if (Number.isNaN(saleDate.getTime())) {
      return;
    }

    const hour = saleDate.getHours();
    const bucketIndex = Math.min(5, Math.max(0, Math.floor(hour / 4)));
    data[bucketIndex] += getSaleAmountValue(sale);
  });

  return { labels, data };
};

const buildCurrentWeekSalesSeries = (sales = []) => {
  const dailyData = new Map();
  const monday = getWeekStartDate(new Date());

  for (let index = 0; index < 7; index += 1) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    dailyData.set(formatDateKey(day), 0);
  }

  sales.forEach((sale) => {
    const saleDate = new Date(sale.sale_date);
    if (Number.isNaN(saleDate.getTime())) {
      return;
    }

    saleDate.setHours(0, 0, 0, 0);
    const saleDateKey = formatDateKey(saleDate);
    if (dailyData.has(saleDateKey)) {
      dailyData.set(saleDateKey, dailyData.get(saleDateKey) + getSaleAmountValue(sale));
    }
  });

  return {
    labels: DAY_LABELS,
    data: Array.from(dailyData.values()),
  };
};

const buildDailySalesSeries = (sales = [], start, end) => {
  const totals = new Map();

  for (let cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const current = new Date(cursor);
    totals.set(formatDateKey(current), 0);
  }

  sales.forEach((sale) => {
    const saleDate = new Date(sale.sale_date);
    if (Number.isNaN(saleDate.getTime()) || saleDate < start || saleDate >= end) {
      return;
    }

    saleDate.setHours(0, 0, 0, 0);
    const saleDateKey = formatDateKey(saleDate);
    if (totals.has(saleDateKey)) {
      totals.set(saleDateKey, totals.get(saleDateKey) + getSaleAmountValue(sale));
    }
  });

  return {
    labels: Array.from(totals.keys()).map((dateKey) => formatShortDateLabel(parseDateKey(dateKey) || new Date())),
    data: Array.from(totals.values()),
  };
};

const buildWeeklySalesSeries = (sales = [], start, end) => {
  const weeklyTotals = new Map();
  const firstWeekStart = getWeekStartDate(start);

  for (let cursor = new Date(firstWeekStart); cursor < end; cursor.setDate(cursor.getDate() + 7)) {
    const current = new Date(cursor);
    weeklyTotals.set(formatDateKey(current), 0);
  }

  sales.forEach((sale) => {
    const saleDate = new Date(sale.sale_date);
    if (Number.isNaN(saleDate.getTime()) || saleDate < start || saleDate >= end) {
      return;
    }

    const weekStartKey = formatDateKey(getWeekStartDate(saleDate));
    if (weeklyTotals.has(weekStartKey)) {
      weeklyTotals.set(weekStartKey, weeklyTotals.get(weekStartKey) + getSaleAmountValue(sale));
    }
  });

  return {
    labels: Array.from(weeklyTotals.keys()).map((dateKey) => formatShortDateLabel(parseDateKey(dateKey) || new Date())),
    data: Array.from(weeklyTotals.values()),
  };
};

const buildYearMonthOptions = (year = new Date().getFullYear()) => Array.from({ length: 12 }, (_, index) => {
  const date = new Date(year, index, 1);

  return {
    key: formatMonthKey(date),
    label: date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
    fullLabel: date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
  };
});

const SALES_SECTION_TABS = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline' },
  { key: 'pipeline', label: 'Follow-Up', icon: 'swap-vertical-outline' },
  { key: 'history', label: 'History', icon: 'receipt-outline' },
  { key: 'products', label: 'Products', icon: 'flower-outline' },
];

const createEmptySalesData = () => ({
  totalSales: 0,
  todaySales: 0,
  weekSales: 0,
  monthSales: 0,
  cashSales: 0,
  creditSales: 0,
  receivable: 0,
  upcomingSales: 0,
  totalOrders: 0,
  completedOrders: 0,
  pendingOrders: 0,
  unpaidCount: 0,
  upcomingCount: 0,
  outstandingItems: [],
  upcomingItems: [],
});

const createEmptyChartData = () => ({
  labels: ['N/A'],
  datasets: [{ data: [0] }],
});

const createEmptyBestSellerSections = () => ({
  combined: [],
  catalogProducts: [],
  bookingFlowers: [],
  customizedFlowers: [],
});

const normalizeBestSellerSections = (payload) => {
  if (Array.isArray(payload)) {
    return {
      combined: payload,
      catalogProducts: payload.filter((item) => String(item?.entry_type || '') === 'catalog_product'),
      bookingFlowers: payload.filter((item) => String(item?.entry_type || '') === 'booking_flower'),
      customizedFlowers: payload.filter((item) => String(item?.entry_type || '') === 'customized_flower'),
    };
  }

  const combined = Array.isArray(payload?.combined)
    ? payload.combined
    : Array.isArray(payload?.data)
      ? payload.data
      : [];
  const catalogProducts = Array.isArray(payload?.catalogProducts)
    ? payload.catalogProducts
    : combined.filter((item) => String(item?.entry_type || '') === 'catalog_product');
  const bookingFlowers = Array.isArray(payload?.bookingFlowers)
    ? payload.bookingFlowers
    : combined.filter((item) => String(item?.entry_type || '') === 'booking_flower');
  const customizedFlowers = Array.isArray(payload?.customizedFlowers)
    ? payload.customizedFlowers
    : combined.filter((item) => String(item?.entry_type || '') === 'customized_flower');

  return {
    combined,
    catalogProducts,
    bookingFlowers,
    customizedFlowers,
  };
};

const SalesTab = () => {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const todayKey = formatDateKey(new Date());
  const [salesData, setSalesData] = useState(createEmptySalesData);
  const [chartData, setChartData] = useState(createEmptyChartData);
  const [activeSection, setActiveSection] = useState('overview');
  const [sectionLoading, setSectionLoading] = useState({
    overview: true,
    pipeline: true,
    history: false,
    products: false,
  });
  const [sectionLoadKey, setSectionLoadKey] = useState({
    overview: '',
    pipeline: '',
    history: '',
    products: '',
  });
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedMonthKey, setSelectedMonthKey] = useState(formatMonthKey(new Date()));
  const [rangeStartKey, setRangeStartKey] = useState(todayKey);
  const [rangeEndKey, setRangeEndKey] = useState(todayKey);
  const [bestSellers, setBestSellers] = useState(createEmptyBestSellerSections);
  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedPipelineItem, setSelectedPipelineItem] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState('start');
  const [calendarMonthDate, setCalendarMonthDate] = useState(parseDateKey(todayKey) || new Date());
  const [exportOptions, setExportOptions] = useState({
    overview: true,
    followUp: true,
    products: true,
    history: true,
  });
  const monthOptions = React.useMemo(() => buildYearMonthOptions(new Date().getFullYear()), []);
  const selectedMonthOption = monthOptions.find((option) => option.key === selectedMonthKey) || monthOptions[0] || null;
  const selectedRangeDetails = React.useMemo(
    () => getRangeDetails(rangeStartKey, rangeEndKey),
    [rangeStartKey, rangeEndKey]
  );
  const activeMonthKey = selectedPeriod === 'month' ? selectedMonthKey : null;
  const activeRangeStartKey = selectedPeriod === 'range' ? selectedRangeDetails.startKey : null;
  const activeRangeEndKey = selectedPeriod === 'range' ? selectedRangeDetails.endKey : null;
  const selectedMonthRange = selectedPeriod === 'month' ? getMonthRange(selectedMonthKey) : null;
  const activeFilterKey = `${selectedPeriod}|${activeMonthKey || ''}|${activeRangeStartKey || ''}|${activeRangeEndKey || ''}`;
  const chartWidth = Math.max(Math.min(width - 30, 720), 280);
  const chartLabelCount = Array.isArray(chartData?.labels) ? chartData.labels.length : 0;
  const maxVisibleChartLabels = selectedPeriod === 'range'
    ? (isWeb ? 8 : 5)
    : (isWeb ? 10 : 6);
  const displayedChartLabels = React.useMemo(
    () => createSparseChartLabels(chartData?.labels || [], maxVisibleChartLabels),
    [chartData?.labels, maxVisibleChartLabels]
  );
  const displayedChartData = React.useMemo(
    () => ({
      ...chartData,
      labels: displayedChartLabels,
    }),
    [chartData, displayedChartLabels]
  );
  const chartNeedsHorizontalScroll = chartLabelCount > maxVisibleChartLabels;
  const effectiveChartWidth = chartNeedsHorizontalScroll
    ? Math.max(chartWidth, chartLabelCount * (isWeb ? 68 : 58))
    : chartWidth;
  const chartHorizontalPadding = isWeb
    ? { paddingLeft: 8, paddingRight: chartNeedsHorizontalScroll ? 16 : 12 }
    : { paddingLeft: 6, paddingRight: chartNeedsHorizontalScroll ? 18 : 10 };
  const chartYAxisWidth = isWeb ? 72 : 74;
  const chartSegments = 4;
  const chartStyle = {
    alignSelf: 'center',
    marginLeft: 0,
    paddingRight: chartNeedsHorizontalScroll ? 20 : 0,
  };
  const chartYAxisLabels = React.useMemo(() => {
    const dataset = Array.isArray(displayedChartData?.datasets?.[0]?.data)
      ? displayedChartData.datasets[0].data
      : [];
    const maxValue = dataset.reduce((highest, value) => {
      const numericValue = Number(value) || 0;
      return numericValue > highest ? numericValue : highest;
    }, 0);
    const safeMaxValue = maxValue > 0 ? maxValue : 0;
    const stepValue = chartSegments > 0 ? safeMaxValue / chartSegments : safeMaxValue;

    return Array.from({ length: chartSegments + 1 }, (_, index) => (
      formatSalesAxisLabel(safeMaxValue - (stepValue * index))
    ));
  }, [displayedChartData]);
  const overviewLoaded = sectionLoadKey.overview === activeFilterKey;
  const historyLoaded = sectionLoadKey.history === activeFilterKey;
  const productsLoaded = sectionLoadKey.products === activeFilterKey;
  const hasBestSellerResults = bestSellers.catalogProducts.length > 0 || bestSellers.bookingFlowers.length > 0 || bestSellers.customizedFlowers.length > 0;
  const isCompactSalesSheet = !isWeb && width <= 480;
  const useStackedDetailRows = !isWeb || width <= 720;
  const salesSheetHorizontalPadding = isWeb ? 20 : (isCompactSalesSheet ? 18 : 20);
  const salesSheetWidth = isWeb ? 580 : Math.min(width - (isCompactSalesSheet ? 12 : 18), 560);
  const salesSheetMaxHeight = isWeb
    ? Math.min(Math.max(height - 48, 520), 780)
    : Math.max(420, Math.min(height - 12, 760));
  const salesSheetMinHeight = isWeb
    ? 0
    : Math.min(salesSheetMaxHeight, Math.max(400, Math.round(height * 0.68)));
  const currentSales = salesData.cashSales;
  const currentCalendarMonthKey = formatMonthKey(calendarMonthDate);
  const currentMonthKey = formatMonthKey(new Date());
  const canGoToNextCalendarMonth = currentCalendarMonthKey < currentMonthKey;
  const calendarDays = React.useMemo(
    () => getCalendarDays(calendarMonthDate, new Date()),
    [calendarMonthDate]
  );
  const currentFilterLabel = selectedPeriod === 'all'
    ? 'All Time'
    : selectedPeriod === 'today'
      ? 'Today'
    : selectedPeriod === 'range'
      ? getDateRangeLabel(selectedRangeDetails.startKey, selectedRangeDetails.endKey)
      : selectedPeriod === 'month' && selectedMonthOption
        ? selectedMonthOption.fullLabel
        : selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1);
  const currentPeriodLabel = currentFilterLabel;
  const currentSalesLabel = selectedPeriod === 'all'
    ? 'Cash Sales'
    : `Cash Sales (${currentPeriodLabel})`;
  const filterBlockStyle = { marginBottom: 4 };

  const setSectionBusy = (sections, value) => {
    setSectionLoading((prev) => {
      const next = { ...prev };
      sections.forEach((section) => {
        next[section] = value;
      });
      return next;
    });
  };

  const handlePeriodSelect = (period) => {
    setSelectedPeriod(period);
    setCalendarModalVisible(false);
    if (period === 'range') {
      const nextRange = getNormalizedRangeKeys(rangeStartKey || todayKey, rangeEndKey || todayKey);
      setRangeStartKey(nextRange.startKey);
      setRangeEndKey(nextRange.endKey);
    }
  };

  const openCalendar = (target) => {
    const activeKey = target === 'end' ? selectedRangeDetails.endKey : selectedRangeDetails.startKey;
    setCalendarTarget(target);
    setCalendarMonthDate(parseDateKey(activeKey) || new Date());
    setCalendarModalVisible(true);
  };

  const changeCalendarMonth = (direction) => {
    setCalendarMonthDate((prev) => {
      const nextMonth = new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
      const cappedCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      if (direction > 0 && nextMonth > cappedCurrentMonth) {
        return prev;
      }
      return nextMonth;
    });
  };

  const handleCalendarPick = (pickedDateKey) => {
    const todayDateKey = formatDateKey(new Date());
    const safeDateKey = pickedDateKey > todayDateKey ? todayDateKey : pickedDateKey;

    if (calendarTarget === 'end') {
      setRangeEndKey(safeDateKey);
      if (safeDateKey < selectedRangeDetails.startKey) {
        setRangeStartKey(safeDateKey);
      }
    } else {
      setRangeStartKey(safeDateKey);
      if (safeDateKey > selectedRangeDetails.endKey) {
        setRangeEndKey(safeDateKey);
      }
    }

    setCalendarModalVisible(false);
  };

  const loadSalesData = async ({ force = false, background = false } = {}) => {
    if (!force && overviewLoaded) {
      return { salesData, chartData };
    }

    if (!background) {
      setSectionBusy(['overview', 'pipeline'], true);
    }

    try {
      const summaryRes = await adminAPI.getSalesSummary({
        period: selectedPeriod,
        monthKey: activeMonthKey,
        rangeStartKey: activeRangeStartKey,
        rangeEndKey: activeRangeEndKey,
      });
      if (summaryRes.error) throw summaryRes.error;

      const summary = summaryRes.data || createEmptySalesData();
      const nextSalesData = {
        totalSales: summary.totalSales,
        todaySales: summary.todaySales,
        weekSales: summary.weekSales,
        monthSales: summary.monthSales,
        cashSales: summary.cashSales,
        creditSales: summary.creditSales,
        receivable: summary.receivable,
        upcomingSales: summary.upcomingSales,
        totalOrders: summary.totalOrders,
        completedOrders: summary.completedOrders,
        pendingOrders: summary.pendingOrders,
        unpaidCount: summary.unpaidCount,
        upcomingCount: summary.upcomingCount,
        outstandingItems: summary.outstandingItems || [],
        upcomingItems: summary.upcomingItems || [],
      };
      setSalesData(nextSalesData);

      const chartRes = await adminAPI.getSalesChartData(
        selectedPeriod,
        activeMonthKey,
        null,
        activeRangeStartKey,
        activeRangeEndKey
      );
      if (chartRes.error) throw chartRes.error;

      const allSales = chartRes.data || [];
      let labels = [];
      let data = [];

      if (selectedPeriod === 'today' || (selectedPeriod === 'range' && selectedRangeDetails.totalDays === 1)) {
        ({ labels, data } = buildHourlySalesSeries(allSales));
      } else if (selectedPeriod === 'range') {
        if (selectedRangeDetails.totalDays <= 31) {
          ({ labels, data } = buildDailySalesSeries(allSales, selectedRangeDetails.start, selectedRangeDetails.end));
        } else {
          ({ labels, data } = buildWeeklySalesSeries(allSales, selectedRangeDetails.start, selectedRangeDetails.end));
        }
      } else if (selectedPeriod === 'week') {
        ({ labels, data } = buildCurrentWeekSalesSeries(allSales));
      } else if (selectedPeriod === 'month' && selectedMonthRange) {
        const totalDays = Math.max(1, Math.ceil((selectedMonthRange.end - selectedMonthRange.start) / (1000 * 60 * 60 * 24)));
        const weekCount = Math.max(4, Math.ceil(totalDays / 7));
        labels = Array.from({ length: weekCount }, (_, index) => `Week ${index + 1}`);
        data = Array(weekCount).fill(0);

        allSales.forEach((sale) => {
          const saleDate = new Date(sale.sale_date);
          if (saleDate >= selectedMonthRange.start && saleDate < selectedMonthRange.end) {
            const diffDays = Math.floor((saleDate - selectedMonthRange.start) / (1000 * 60 * 60 * 24));
            const weekIndex = Math.min(weekCount - 1, Math.floor(diffDays / 7));
            data[weekIndex] += getSaleAmountValue(sale);
          }
        });
      } else {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthTotals = Array(12).fill(0);
        const currentYear = new Date().getFullYear();

        allSales.forEach((sale) => {
          const saleDate = new Date(sale.sale_date);
          if (saleDate.getFullYear() === currentYear) {
            const monthIndex = saleDate.getMonth();
            monthTotals[monthIndex] += getSaleAmountValue(sale);
          }
        });
        data = monthTotals;
      }

      const allSame = data.length > 1 && data.every((value) => value === data[0]);
      if (allSame) {
        data[data.length - 1] += 0.0001;
      }

      const nextChartData = {
        labels,
        datasets: [{ data: data.length > 0 ? data : [0] }],
      };
      setChartData(nextChartData);
      setSectionLoadKey((prev) => ({
        ...prev,
        overview: activeFilterKey,
        pipeline: activeFilterKey,
      }));

      return { salesData: nextSalesData, chartData: nextChartData };
    } catch (error) {
      console.error('Error loading sales data:', error);
      const emptySalesData = createEmptySalesData();
      const emptyChartData = createEmptyChartData();
      setSalesData(emptySalesData);
      setChartData(emptyChartData);
      setSectionLoadKey((prev) => ({
        ...prev,
        overview: activeFilterKey,
        pipeline: activeFilterKey,
      }));
      return { salesData: emptySalesData, chartData: emptyChartData };
    } finally {
      if (!background) {
        setSectionBusy(['overview', 'pipeline'], false);
      }
    }
  };

  const loadBestSellers = async ({ force = false, background = false } = {}) => {
    if (!force && productsLoaded) {
      return bestSellers;
    }

    if (!background) {
      setSectionBusy(['products'], true);
    }

    try {
      const res = await adminAPI.getBestSellingProducts(
        selectedPeriod,
        activeMonthKey,
        null,
        activeRangeStartKey,
        activeRangeEndKey
      );
      const nextBestSellers = normalizeBestSellerSections(res);
      setBestSellers(nextBestSellers);
      setSectionLoadKey((prev) => ({
        ...prev,
        products: activeFilterKey,
      }));
      return nextBestSellers;
    } catch (error) {
      console.error('Error loading best sellers:', error);
      const emptyBestSellers = createEmptyBestSellerSections();
      setBestSellers(emptyBestSellers);
      setSectionLoadKey((prev) => ({
        ...prev,
        products: activeFilterKey,
      }));
      return emptyBestSellers;
    } finally {
      if (!background) {
        setSectionBusy(['products'], false);
      }
    }
  };

  const loadTransactions = async ({ force = false, background = false } = {}) => {
    if (!force && historyLoaded) {
      return transactions;
    }

    if (!background) {
      setSectionBusy(['history'], true);
    }

    try {
      const res = await adminAPI.getTransactionHistory(
        selectedPeriod,
        activeMonthKey,
        null,
        activeRangeStartKey,
        activeRangeEndKey
      );
      const nextTransactions = res.data || [];
      setTransactions(nextTransactions);
      setSectionLoadKey((prev) => ({
        ...prev,
        history: activeFilterKey,
      }));
      return nextTransactions;
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions([]);
      setSectionLoadKey((prev) => ({
        ...prev,
        history: activeFilterKey,
      }));
      return [];
    } finally {
      if (!background) {
        setSectionBusy(['history'], false);
      }
    }
  };

  const loadVisibleSalesData = async ({ force = false, background = false } = {}) => {
    const tasks = [loadSalesData({ force, background })];
    if (activeSection === 'history') {
      tasks.push(loadTransactions({ force, background }));
    }
    if (activeSection === 'products') {
      tasks.push(loadBestSellers({ force, background }));
    }
    await Promise.all(tasks);
  };

  useEffect(() => {
    loadVisibleSalesData();

    const subscription = supabase
      .channel(`sales-tab-realtime-${activeSection}-${activeFilterKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { loadVisibleSalesData({ force: true }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadVisibleSalesData({ force: true }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => { loadVisibleSalesData({ force: true }); })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [activeSection, activeFilterKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadVisibleSalesData({ force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount) => {
    const parsed = Number.parseFloat(amount);
    const safeAmount = Number.isFinite(parsed) ? parsed : 0;
    return `\u20b1${safeAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return 'N/A';
    }

    return parsed.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceBadgeColor = (type) => {
    if (type === 'Order') return '#3B82F6';
    if (type === 'booking') return '#8B5CF6';
    if (type === 'customized') return '#EC4899';
    if (type === 'special_order') return '#F59E0B';
    return '#6B7280';
  };

  const getSourceLabel = (type) => {
    if (type === 'Order') return 'Order';
    if (type === 'booking') return 'Custom Order';
    if (type === 'customized') return 'Customizer Studio';
    if (type === 'special_order') return 'Special';
    return 'Request';
  };

  const formatPlainLabel = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';

    return normalized
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getStatusBadgeColor = (status) => {
    switch (String(status || '').trim().toLowerCase()) {
      case 'paid':
        return '#16A34A';
      case 'partial':
        return '#D97706';
      case 'to_pay':
      case 'waiting_for_confirmation':
        return '#DC2626';
      default:
        return getStatusColor(String(status || '').trim().toLowerCase());
    }
  };

  const renderTransactionDetailRow = (label, value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    return (
      <View
        style={{
          flexDirection: useStackedDetailRows ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: useStackedDetailRows ? 4 : 12,
          paddingVertical: 7,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
        }}
      >
        <Text
          style={{
            flex: useStackedDetailRows ? 0 : 1,
            minWidth: 0,
            flexShrink: 1,
            color: '#6B7280',
            fontSize: 12,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            flex: useStackedDetailRows ? 0 : 1.4,
            minWidth: 0,
            flexShrink: 1,
            color: '#111827',
            fontSize: 12,
            fontWeight: '700',
            textAlign: useStackedDetailRows ? 'left' : 'right',
            alignSelf: useStackedDetailRows ? 'stretch' : 'auto',
            lineHeight: 18,
          }}
        >
          {value}
        </Text>
      </View>
    );
  };

  const renderTransactionItemRow = (item, index) => {
    const quantity = Number.parseFloat(item?.quantity);
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const lineTotal = Number.isFinite(Number.parseFloat(item?.lineTotal))
      ? Number.parseFloat(item.lineTotal)
      : Number.parseFloat(item?.price || 0) * safeQuantity;

    return (
      <View key={`${item?.name || 'item'}-${index}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
        <View style={{ flexDirection: useStackedDetailRows ? 'column' : 'row', justifyContent: 'space-between', gap: useStackedDetailRows ? 4 : 10 }}>
          <Text style={{ flex: useStackedDetailRows ? 0 : 1, minWidth: 0, flexShrink: 1, color: '#111827', fontSize: 13, fontWeight: '700', lineHeight: 19 }}>
            {item?.name || `Item ${index + 1}`} x {safeQuantity}
          </Text>
          <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '700', textAlign: useStackedDetailRows ? 'left' : 'right' }}>
            {formatCurrency(lineTotal)}
          </Text>
        </View>
        {item?.description ? <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 3 }}>{item.description}</Text> : null}
      </View>
    );
  };

  const renderPipelineItem = (item, section = 'unpaid') => {
    const sourceType = item.sourceType || (item.entityType === 'order' ? 'Order' : 'Request');
    const amountLabel = section === 'unpaid' ? 'Remaining' : 'Amount';
    const amountValue = section === 'unpaid' ? item.remainingBalance : item.totalAmount;

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.78}
        onPress={() => setSelectedPipelineItem({ ...item, section, sourceType, amountLabel, amountValue })}
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          elevation: 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#333' }} numberOfLines={1}>#{item.refNumber}</Text>
              <View style={{ backgroundColor: getSourceBadgeColor(sourceType), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{getSourceLabel(sourceType)}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{item.customerName}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>{item.scheduleText || 'Active record'}</Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{formatDate(item.scheduleDate || new Date())}</Text>
          </View>

          <View style={{ alignItems: 'flex-end', minWidth: 120 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{amountLabel}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: section === 'unpaid' ? '#DC2626' : '#16A34A' }}>
              {formatCurrency(amountValue)}
            </Text>
            {section === 'unpaid' ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Due {formatCurrency(item.totalAmount)}</Text> : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <View style={{ backgroundColor: `${getStatusBadgeColor(item.status)}18`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: getStatusBadgeColor(item.status) }}>{getStatusLabel(item.status)}</Text>
          </View>

          <View style={{ backgroundColor: `${getStatusBadgeColor(item.paymentStatus)}18`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: getStatusBadgeColor(item.paymentStatus) }}>
              {getPaymentStatusDisplay(item.paymentStatus)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10 }}>
          <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>Tap to view details</Text>
          <Ionicons name="chevron-forward" size={14} color="#ccc" />
        </View>
      </TouchableOpacity>
    );
  };

  const openExportModal = () => {
    setExportModalVisible(true);
  };

  const handleExportReport = async () => {
    setExportModalVisible(false);
    setExporting(true);

    try {
      const exportSalesState = overviewLoaded
        ? salesData
        : (await loadSalesData({ force: true, background: true })).salesData;
      const exportBestSellers = exportOptions.products
        ? (productsLoaded ? bestSellers : await loadBestSellers({ force: true, background: true }))
        : bestSellers;
      const exportTransactions = exportOptions.history
        ? (historyLoaded ? transactions : await loadTransactions({ force: true, background: true }))
        : transactions;
      const exportCurrentSales = exportSalesState.cashSales;
      const periodLabel = currentPeriodLabel;
      const dateGenerated = new Date().toLocaleDateString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const exportOutstandingItems = exportSalesState.outstandingItems || [];
      const exportUpcomingItems = exportSalesState.upcomingItems || [];
      const exportCatalogBestSellers = exportBestSellers?.catalogProducts || [];
      const exportBookingFlowers = exportBestSellers?.bookingFlowers || [];
      const exportCustomizedFlowers = exportBestSellers?.customizedFlowers || [];

      const renderHtmlTable = (columns, rows, emptyMessage) => {
        if (!rows.length) {
          return `<p class="empty-note">${emptyMessage}</p>`;
        }

        return `
          <table>
            <thead>
              <tr>${columns.map((column) => `<th style="${column.style || ''}">${column.label}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => `<tr>${row.map((cell, index) => `<td style="${columns[index]?.cellStyle || ''}">${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        `;
      };

      const renderBestSellerTable = (items, emptyMessage) => {
        if (!items.length) {
          return `<p class="empty-note">${emptyMessage}</p>`;
        }

        const rows = items.map((product, index) => `
          <tr>
            <td style="padding: 8px; text-align: center; font-weight: ${index === 0 ? 'bold' : 'normal'}; color: ${index === 0 ? '#D97706' : '#333'};">#${index + 1}</td>
            <td style="padding: 8px;">${product.name}</td>
            <td style="padding: 8px;">${product.source_label || 'Item'}</td>
            <td style="padding: 8px; text-align: center;">${product.total_sold}</td>
            <td style="padding: 8px; text-align: right;">&#8369;${Number(product.total_revenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          </tr>
        `).join('');

        return `<table><thead><tr><th style="text-align: center;">Rank</th><th>Product</th><th>Type</th><th style="text-align: center;">Units Sold</th><th style="text-align: right;">Revenue</th></tr></thead><tbody>${rows}</tbody></table>`;
      };

      const transactionRows = exportTransactions.map((transaction) => `
        <tr>
          <td style="padding: 6px 8px; font-size: 11px;">${new Date(transaction.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td style="padding: 6px 8px; font-size: 11px;">${transaction.refNumber}</td>
          <td style="padding: 6px 8px; font-size: 11px;">${getSourceLabel(transaction.sourceType)}</td>
          <td style="padding: 6px 8px; font-size: 11px;">${transaction.customerName}</td>
          <td style="padding: 6px 8px; text-align: right; font-size: 11px; font-weight: 600;">&#8369;${transaction.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('');

      const followUpColumns = [
        { label: 'Reference' },
        { label: 'Type' },
        { label: 'Customer' },
        { label: 'Status' },
        { label: 'Payment' },
        { label: 'Schedule' },
        { label: 'Amount', style: 'text-align: right;', cellStyle: 'text-align: right; font-weight: 600;' },
      ];

      const outstandingTable = renderHtmlTable(
        followUpColumns,
        exportOutstandingItems.map((item) => [
          `#${item.refNumber}`,
          getSourceLabel(item.sourceType || (item.entityType === 'order' ? 'Order' : 'Request')),
          item.customerName || 'N/A',
          getStatusLabel(item.status),
          getPaymentStatusDisplay(item.paymentStatus),
          item.scheduleText || 'Awaiting payment',
          formatCurrency(item.remainingBalance),
        ]),
        'No unpaid items for this filter.'
      );

      const upcomingTable = renderHtmlTable(
        followUpColumns,
        exportUpcomingItems.map((item) => [
          `#${item.refNumber}`,
          getSourceLabel(item.sourceType || (item.entityType === 'order' ? 'Order' : 'Request')),
          item.customerName || 'N/A',
          getStatusLabel(item.status),
          getPaymentStatusDisplay(item.paymentStatus),
          item.scheduleText || 'Active order',
          formatCurrency(item.totalAmount),
        ]),
        'No upcoming items for this filter.'
      );

      const html = `
        <html><head><meta charset="utf-8"><style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #333; }
          h1 { color: #EC4899; margin-bottom: 5px; }
          h2 { color: #333; border-bottom: 2px solid #EC4899; padding-bottom: 5px; margin-top: 30px; }
          h3 { color: #4B5563; margin-top: 20px; margin-bottom: 8px; }
          .subtitle { color: #666; font-size: 13px; margin-bottom: 25px; }
          .summary-grid { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
          .summary-card { flex: 1; min-width: 120px; border: 1px solid #eee; border-radius: 10px; padding: 15px; text-align: center; }
          .summary-card .value { font-size: 22px; font-weight: bold; color: #333; }
          .summary-card .label { font-size: 11px; color: #888; margin-top: 4px; }
          .summary-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          .summary-table td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
          .summary-table td:last-child { text-align: right; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #f8f8f8; padding: 10px 8px; text-align: left; font-size: 12px; color: #666; border-bottom: 2px solid #eee; }
          td { border-bottom: 1px solid #f0f0f0; padding: 8px; font-size: 11px; }
          .empty-note { color: #6B7280; font-size: 12px; margin-top: 8px; }
        </style></head><body>
          <h1>Jocery's Flower Shop</h1>
          <p class="subtitle">Sales Report - ${periodLabel} | Generated: ${dateGenerated}</p>
          ${exportOptions.overview ? `
            <h2>Overview</h2>
            <div class="summary-grid">
              <div class="summary-card"><div class="value">&#8369;${exportCurrentSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div><div class="label">${periodLabel} Cash Sales</div></div>
              <div class="summary-card"><div class="value">&#8369;${exportSalesState.creditSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div><div class="label">Credit Sales</div></div>
              <div class="summary-card"><div class="value">&#8369;${exportSalesState.receivable.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div><div class="label">Receivable</div></div>
              <div class="summary-card"><div class="value">&#8369;${exportSalesState.upcomingSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div><div class="label">Upcoming Sales</div></div>
              <div class="summary-card"><div class="value">${exportSalesState.unpaidCount}</div><div class="label">Orders Not Yet Paid</div></div>
              <div class="summary-card"><div class="value">${exportSalesState.upcomingCount}</div><div class="label">Upcoming Orders</div></div>
            </div>
            <table class="summary-table">
              <tbody>
                <tr><td>Total records</td><td>${exportSalesState.totalOrders}</td></tr>
                <tr><td>Completed</td><td>${exportSalesState.completedOrders}</td></tr>
                <tr><td>Active / pending</td><td>${exportSalesState.pendingOrders}</td></tr>
              </tbody>
            </table>` : ''}
          ${exportOptions.followUp ? `
            <h2>Follow-Up</h2>
            <h3>Unpaid Items</h3>
            ${outstandingTable}
            <h3>Upcoming Items</h3>
            ${upcomingTable}` : ''}
          ${exportOptions.products ? `
            <h2>Products</h2>
            <h3>Best-Selling Normal Orders</h3>
            ${renderBestSellerTable(exportCatalogBestSellers, 'No best-selling normal-order products for this filter.')}
            <h3>Best-Selling Flowers</h3>
            <h4 style="color: #6B7280; margin-top: 14px; margin-bottom: 6px;">From Custom Orders</h4>
            ${renderBestSellerTable(exportBookingFlowers, 'No best-selling flowers from Custom Orders for this filter.')}
            <h4 style="color: #6B7280; margin-top: 14px; margin-bottom: 6px;">From Customizer Studio</h4>
            ${renderBestSellerTable(exportCustomizedFlowers, 'No best-selling flowers from Customizer Studio for this filter.')}
          ` : ''}
          ${exportOptions.history ? `<h2>History</h2>${exportTransactions.length > 0 ? `<table><thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Customer</th><th style="text-align: right;">Amount</th></tr></thead><tbody>${transactionRows}</tbody></table>` : `<p class="empty-note">No payment history for this filter.</p>`}` : ''}
        </body></html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Sales Report', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF Generated', `Report saved to: ${uri}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Export Failed', 'Could not generate the report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const selectedTransactionItems = selectedTransaction?.items || [];
  const selectedRequestDetails = selectedTransaction?.requestDetails || {};
  const summaryCards = [
    { icon: 'cash', color: '#4CAF50', value: formatCurrency(currentSales), label: currentSalesLabel },
    { icon: 'card', color: '#2563EB', value: formatCurrency(salesData.creditSales), label: 'Credit Sales' },
    { icon: 'wallet', color: '#DC2626', value: formatCurrency(salesData.receivable), label: 'Receivable' },
    { icon: 'calendar', color: '#F59E0B', value: formatCurrency(salesData.upcomingSales), label: 'Upcoming Sales' },
    { icon: 'alert-circle', color: '#DC2626', value: String(salesData.unpaidCount), label: 'Orders Not Yet Paid' },
    { icon: 'time', color: '#0891B2', value: String(salesData.upcomingCount), label: 'Upcoming Orders' },
  ];
  const summaryCardRows = [];
  for (let index = 0; index < summaryCards.length; index += 2) {
    summaryCardRows.push(summaryCards.slice(index, index + 2));
  }

  const renderEmptyState = (icon, label) => (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', justifyContent: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
      <Ionicons name={icon} size={38} color="#D1D5DB" />
      <Text style={{ color: '#9CA3AF', marginTop: 8, fontSize: 13, textAlign: 'center' }}>{label}</Text>
    </View>
  );

  const renderSectionLoading = (label) => (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', justifyContent: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
      <ActivityIndicator size="small" color="#ec4899" />
      <Text style={{ color: '#6B7280', marginTop: 10 }}>{label}</Text>
    </View>
  );

  const renderOverviewSection = () => (
    <View>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingTop: 10, paddingBottom: 12, borderWidth: 1, borderColor: '#eee', marginBottom: 12 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#333', paddingHorizontal: 14, marginBottom: 6 }}>Sales Trend</Text>
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={chartNeedsHorizontalScroll}
          contentContainerStyle={chartHorizontalPadding}
        >
          <View style={{ flexDirection: 'row', alignItems: 'stretch', overflow: 'visible' }}>
            <View
              style={{
                width: chartYAxisWidth,
                height: 180,
                justifyContent: 'space-between',
                paddingTop: 10,
                paddingBottom: 24,
                paddingRight: 8,
              }}
            >
              {chartYAxisLabels.map((label, index) => (
                <Text
                  key={`sales-y-axis-${index}`}
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    color: '#374151',
                    textAlign: 'right',
                    includeFontPadding: false,
                  }}
                >
                  {label}
                </Text>
              ))}
            </View>

            <LineChart
              data={displayedChartData}
              width={effectiveChartWidth}
              height={180}
              chartConfig={{
                backgroundColor: '#fff',
                backgroundGradientFrom: '#fff',
                backgroundGradientTo: '#fff',
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
                propsForDots: { r: '5', strokeWidth: '2', stroke: '#ec4899' },
                propsForLabels: {
                  fontSize: chartNeedsHorizontalScroll ? 10 : 11,
                },
              }}
              bezier
              withDots={!isWeb}
              fromZero
              segments={chartSegments}
              withHorizontalLabels={false}
              verticalLabelRotation={chartNeedsHorizontalScroll ? -35 : 0}
              style={chartStyle}
            />
          </View>
        </ScrollView>
      </View>
      <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>
        Cards and chart update from the live orders and requests in Supabase.
      </Text>

      {summaryCardRows.map((row, rowIndex) => (
        <View key={`sales-row-${rowIndex}`} style={styles.salesSummaryContainer}>
          {row.map((card) => (
            <View key={card.label} style={styles.salesCard}>
              <Ionicons name={card.icon} size={30} color={card.color} />
              <Text style={styles.salesCardValue}>{card.value}</Text>
              <Text style={styles.salesCardLabel}>{card.label}</Text>
            </View>
          ))}
        </View>
      ))}

      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 15, marginBottom: 16, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#333' }}>Sales Snapshot</Text>
          <View style={{ backgroundColor: '#FDF2F8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: '#BE185D', fontSize: 11, fontWeight: '700' }}>Overview</Text>
          </View>
        </View>
        <View style={styles.statRow}><Text style={styles.statLabel}>Total records</Text><Text style={styles.statValue}>{salesData.totalOrders}</Text></View>
        <View style={styles.statRow}><Text style={styles.statLabel}>Completed</Text><Text style={styles.statValue}>{salesData.completedOrders}</Text></View>
        <View style={styles.statRow}><Text style={styles.statLabel}>Active / pending</Text><Text style={styles.statValue}>{salesData.pendingOrders}</Text></View>
        <View style={styles.statRowTotal}>
          <Text style={styles.statLabelTotal}>Receivable vs cash</Text>
          <Text style={styles.statValueTotal}>{formatCurrency(salesData.receivable)} / {formatCurrency(currentSales)}</Text>
        </View>
      </View>
    </View>
  );

  const renderPipelineSection = () => (
    <View>
      <View style={styles.salesSummaryContainer}>
        <View style={styles.salesCard}>
          <Ionicons name="wallet-outline" size={30} color="#DC2626" />
          <Text style={styles.salesCardValue}>{salesData.unpaidCount}</Text>
          <Text style={styles.salesCardLabel}>Need payment follow-up</Text>
        </View>
        <View style={styles.salesCard}>
          <Ionicons name="calendar-clear-outline" size={30} color="#F59E0B" />
          <Text style={styles.salesCardValue}>{salesData.upcomingCount}</Text>
          <Text style={styles.salesCardLabel}>Scheduled upcoming sales</Text>
        </View>
      </View>

      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Orders Not Yet Paid</Text>
          <View style={{ backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto' }}>
            <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700' }}>{salesData.unpaidCount}</Text>
          </View>
        </View>
        {salesData.outstandingItems.length === 0 ? renderEmptyState('checkmark-done-circle-outline', 'No unpaid orders for this filter') : salesData.outstandingItems.map((item) => renderPipelineItem(item, 'unpaid'))}
      </View>

      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Upcoming Sales</Text>
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto' }}>
            <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '700' }}>{salesData.upcomingCount}</Text>
          </View>
        </View>
        {salesData.upcomingItems.length === 0 ? renderEmptyState('calendar-clear-outline', 'No upcoming sales for this filter') : salesData.upcomingItems.map((item) => renderPipelineItem(item, 'upcoming'))}
      </View>
    </View>
  );

  const renderProductsSection = () => {
    if (sectionLoading.products && !productsLoaded) {
      return renderSectionLoading('Loading best sellers...');
    }
    if (!hasBestSellerResults) {
      return renderEmptyState('flower-outline', 'No sales data yet');
    }

    const renderBestSellerCarousel = (items, emptyMessage) => {
      if (!items.length) {
        return (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>{emptyMessage}</Text>
          </View>
        );
      }

      return (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={items}
          keyExtractor={(item) => String(item.item_key || item.product_id || item.name)}
          renderItem={({ item, index }) => (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, marginRight: 12, width: 148, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, borderWidth: index === 0 ? 2 : 0, borderColor: index === 0 ? '#D97706' : 'transparent' }}>
              <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: index === 0 ? '#D97706' : index === 1 ? '#9CA3AF' : index === 2 ? '#B45309' : '#D1D5DB', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{index + 1}</Text>
              </View>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 8, marginTop: 4 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 8, marginTop: 4, backgroundColor: '#fce4ec', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="flower" size={28} color="#ec4899" />
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#333', textAlign: 'center' }} numberOfLines={2}>{item.name}</Text>
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 }}>
                <Text style={{ fontSize: 10, color: '#4B5563', fontWeight: '700' }}>{item.source_label || 'Item'}</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#ec4899', marginTop: 4 }}>{item.total_sold}</Text>
              <Text style={{ fontSize: 10, color: '#888' }}>units sold</Text>
              <Text style={{ fontSize: 11, color: '#4CAF50', fontWeight: '600', marginTop: 2 }}>{formatCurrency(item.total_revenue)}</Text>
            </View>
          )}
        />
      );
    };

    return (
      <View>
        <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
          Normal order best sellers stay at the top. Flower stems are split below into Custom Orders and Customizer Studio.
        </Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
          Best-Selling Normal Orders
        </Text>
        {renderBestSellerCarousel(bestSellers.catalogProducts, 'No best-selling normal-order products for this filter.')}
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 20, marginBottom: 10 }}>
          Best-Selling Flowers
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#4B5563', marginBottom: 10 }}>
          From Custom Orders
        </Text>
        {renderBestSellerCarousel(bestSellers.bookingFlowers, 'No best-selling flowers from Custom Orders for this filter.')}
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#4B5563', marginTop: 18, marginBottom: 10 }}>
          From Customizer Studio
        </Text>
        {renderBestSellerCarousel(bestSellers.customizedFlowers, 'No best-selling flowers from Customizer Studio for this filter.')}
      </View>
    );
  };

  const renderHistorySection = () => {
    if (sectionLoading.history && !historyLoaded) {
      return renderSectionLoading('Loading payment history...');
    }
    if (transactions.length === 0) {
      return renderEmptyState('receipt-outline', 'No payments found for this period');
    }

    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Payment History</Text>
          <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto' }}>
            <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600' }}>{transactions.length} records</Text>
          </View>
        </View>
        {transactions.map((transaction) => (
          <TouchableOpacity
            key={transaction.id}
            activeOpacity={0.7}
            onPress={() => setSelectedTransaction(transaction)}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, borderLeftWidth: 4, borderLeftColor: getSourceBadgeColor(transaction.sourceType) }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#333', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="middle">#{transaction.refNumber}</Text>
                  <View style={{ backgroundColor: getSourceBadgeColor(transaction.sourceType), borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{getSourceLabel(transaction.sourceType)}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#888' }}>{transaction.customerName}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4CAF50' }}>{formatCurrency(transaction.amount)}</Text>
                <Text style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{formatDate(transaction.date)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
              <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>Tap to view details</Text>
              <Ionicons name="chevron-forward" size={14} color="#ccc" />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderActiveSection = () => {
    if (activeSection === 'pipeline') return renderPipelineSection();
    if (activeSection === 'history') return renderHistorySection();
    if (activeSection === 'products') return renderProductsSection();
    return renderOverviewSection();
  };

  const renderSalesDetailSheet = ({ visible, onClose, title, subtitle, children }) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={[
          styles.modalContainer,
          !isWeb && {
            justifyContent: 'center',
            alignItems: 'stretch',
            paddingHorizontal: isCompactSalesSheet ? 6 : 10,
            paddingVertical: isCompactSalesSheet ? 10 : 16,
          },
        ]}
      >
        <View style={[
          styles.modalContent,
          isWeb
            ? { width: 580, maxHeight: salesSheetMaxHeight, padding: 0, borderRadius: 18, overflow: 'hidden' }
            : {
              width: salesSheetWidth,
              maxWidth: salesSheetWidth,
              maxHeight: salesSheetMaxHeight,
              minHeight: salesSheetMinHeight,
              padding: 0,
              borderRadius: isCompactSalesSheet ? 20 : 22,
              overflow: 'hidden',
              alignSelf: 'center',
            },
        ]}>
          <View style={{ paddingHorizontal: salesSheetHorizontalPadding, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle ? <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 4, lineHeight: 18 }}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, minHeight: 160 }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: salesSheetHorizontalPadding,
                paddingTop: 16,
                paddingBottom: 28,
                flexGrow: 1,
              }}
            >
              {children || (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
                  <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                    No sale details are available for this record yet.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>

          <View style={{ paddingHorizontal: salesSheetHorizontalPadding, paddingTop: 12, paddingBottom: isWeb ? 18 : 22, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' }}>
            <TouchableOpacity style={{ backgroundColor: '#ec4899', borderRadius: 14, minHeight: 48, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const initialOverviewLoading = !overviewLoaded && sectionLoading.overview && !refreshing;

  if (initialOverviewLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading sales data...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <Text style={styles.tabTitle}>Sales Dashboard</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ec4899', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, gap: 6, elevation: 2 }}
            onPress={openExportModal}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text-outline" size={16} color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{exporting ? 'Generating...' : 'Export PDF'}</Text>
          </TouchableOpacity>
        </View>

        <View style={filterBlockStyle}>
          <Text style={styles.filterLabel}>Period:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {['today', 'range', 'week', 'month', 'all'].map((period) => (
              <TouchableOpacity key={period} style={[styles.categoryChip, selectedPeriod === period && styles.categoryChipActive]} onPress={() => handlePeriodSelect(period)}>
                <Text style={[styles.categoryChipText, selectedPeriod === period && styles.categoryChipTextActive]}>
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedPeriod === 'range' ? (
          <View style={filterBlockStyle}>
            <Text style={styles.filterLabel}>Date range:</Text>
            <View style={{ flexDirection: isCompactSalesSheet ? 'column' : 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#FBCFE8',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
                onPress={() => openCalendar('start')}
              >
                <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>From</Text>
                <Text style={{ color: '#111827', fontWeight: '700', fontSize: 13 }}>{getDateLabel(selectedRangeDetails.startKey)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#FBCFE8',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
                onPress={() => openCalendar('end')}
              >
                <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>To</Text>
                <Text style={{ color: '#111827', fontWeight: '700', fontSize: 13 }}>{getDateLabel(selectedRangeDetails.endKey)}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
              Pick the same day in both fields if you want a one-day report.
            </Text>
          </View>
        ) : null}

        {selectedPeriod === 'month' ? (
          <View style={filterBlockStyle}>
            <Text style={styles.filterLabel}>Month:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {monthOptions.map((monthOption) => (
                <TouchableOpacity key={monthOption.key} style={[styles.categoryChip, selectedMonthKey === monthOption.key && styles.categoryChipActive]} onPress={() => setSelectedMonthKey(monthOption.key)}>
                  <Text style={[styles.categoryChipText, selectedMonthKey === monthOption.key && styles.categoryChipTextActive]}>{monthOption.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ marginBottom: 14 }}>
          <Text style={styles.filterLabel}>Section:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {SALES_SECTION_TABS.map((section) => {
              const isActive = activeSection === section.key;
              return (
                <TouchableOpacity key={section.key} style={[styles.categoryChip, isActive && styles.categoryChipActive]} onPress={() => setActiveSection(section.key)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={section.icon} size={14} color={isActive ? '#fff' : '#666'} />
                    <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{section.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {renderActiveSection()}
        <View style={{ height: 28 }} />
      </ScrollView>

      {renderSalesDetailSheet({
        visible: Boolean(selectedTransaction),
        onClose: () => setSelectedTransaction(null),
        title: 'Payment Details',
        subtitle: selectedTransaction ? `#${selectedTransaction.refNumber} - ${getSourceLabel(selectedTransaction.sourceType)}` : '',
        children: selectedTransaction ? (
          <>
            <View style={{ backgroundColor: '#FDF2F8', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FBCFE8' }}>
              <Text style={{ color: '#9D174D', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Received</Text>
              <Text style={{ color: '#BE185D', fontSize: 24, fontWeight: '800', marginTop: 4 }}>{formatCurrency(selectedTransaction.amount)}</Text>
            </View>
            <View style={{ marginBottom: 14 }}>
              {renderTransactionDetailRow('Reference', `#${selectedTransaction.refNumber}`)}
              {renderTransactionDetailRow('Type', getSourceLabel(selectedTransaction.sourceType))}
              {renderTransactionDetailRow('Customer', selectedTransaction.customerName)}
              {renderTransactionDetailRow('Email', selectedTransaction.customerEmail)}
              {renderTransactionDetailRow('Date', formatDate(selectedTransaction.date))}
              {renderTransactionDetailRow('Status', selectedTransaction.status ? getStatusLabel(selectedTransaction.status) : null)}
              {renderTransactionDetailRow('Payment', selectedTransaction.paymentStatus ? getPaymentStatusDisplay(selectedTransaction.paymentStatus) : null)}
              {renderTransactionDetailRow('Payment Method', formatPlainLabel(selectedTransaction.paymentMethod))}
              {renderTransactionDetailRow('Total Amount', selectedTransaction.totalAmount > 0 ? formatCurrency(selectedTransaction.totalAmount) : null)}
              {renderTransactionDetailRow('Amount Paid', selectedTransaction.amountReceived > 0 ? formatCurrency(selectedTransaction.amountReceived) : null)}
              {renderTransactionDetailRow('Remaining Balance', selectedTransaction.remainingBalance > 0 ? formatCurrency(selectedTransaction.remainingBalance) : null)}
              {renderTransactionDetailRow('Delivery Method', formatPlainLabel(selectedTransaction.deliveryMethod))}
              {renderTransactionDetailRow('Pickup Time', selectedTransaction.pickupTime)}
              {renderTransactionDetailRow('Delivery Fee', selectedTransaction.shippingFee > 0 ? formatCurrency(selectedTransaction.shippingFee) : null)}
            </View>
            {selectedTransaction.entityType === 'request' ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 6 }}>Request Details</Text>
                {renderTransactionDetailRow('Items Count', selectedRequestDetails.itemCount)}
                {renderTransactionDetailRow('Recipient', selectedRequestDetails.recipientName)}
                {renderTransactionDetailRow('Occasion', selectedRequestDetails.occasion)}
                {renderTransactionDetailRow('Event Date', selectedRequestDetails.eventDate)}
                {renderTransactionDetailRow('Event Time', selectedRequestDetails.eventTime)}
                {renderTransactionDetailRow('Venue', selectedRequestDetails.venue)}
                {renderTransactionDetailRow('Instructions', selectedRequestDetails.specialInstructions)}
              </View>
            ) : null}
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 6 }}>Items</Text>
              {selectedTransactionItems.length ? selectedTransactionItems.map(renderTransactionItemRow) : <Text style={{ color: '#6B7280', fontSize: 12 }}>No saved item breakdown for this sale.</Text>}
            </View>
          </>
        ) : null,
      })}

      {renderSalesDetailSheet({
        visible: Boolean(selectedPipelineItem),
        onClose: () => setSelectedPipelineItem(null),
        title: selectedPipelineItem?.section === 'unpaid' ? 'Unpaid Order Details' : 'Upcoming Sale Details',
        subtitle: selectedPipelineItem ? `#${selectedPipelineItem.refNumber} - ${getSourceLabel(selectedPipelineItem.sourceType)}` : '',
        children: selectedPipelineItem ? (
          <>
            <View style={{ backgroundColor: selectedPipelineItem.section === 'unpaid' ? '#FEF2F2' : '#ECFDF5', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: selectedPipelineItem.section === 'unpaid' ? '#FECACA' : '#BBF7D0' }}>
              <Text style={{ color: selectedPipelineItem.section === 'unpaid' ? '#991B1B' : '#047857', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{selectedPipelineItem.amountLabel}</Text>
              <Text style={{ color: selectedPipelineItem.section === 'unpaid' ? '#DC2626' : '#16A34A', fontSize: 24, fontWeight: '800', marginTop: 4 }}>{formatCurrency(selectedPipelineItem.amountValue)}</Text>
            </View>
            <View style={{ marginBottom: 14 }}>
              {renderTransactionDetailRow('Reference', `#${selectedPipelineItem.refNumber}`)}
              {renderTransactionDetailRow('Type', getSourceLabel(selectedPipelineItem.sourceType))}
              {renderTransactionDetailRow('Customer', selectedPipelineItem.customerName)}
              {renderTransactionDetailRow('Email', selectedPipelineItem.customerEmail)}
              {renderTransactionDetailRow('Schedule', selectedPipelineItem.scheduleText)}
              {renderTransactionDetailRow('Date', formatDate(selectedPipelineItem.scheduleDate || new Date()))}
              {renderTransactionDetailRow('Order Status', selectedPipelineItem.status ? getStatusLabel(selectedPipelineItem.status) : null)}
              {renderTransactionDetailRow('Payment Status', selectedPipelineItem.paymentStatus ? getPaymentStatusDisplay(selectedPipelineItem.paymentStatus) : null)}
              {renderTransactionDetailRow('Total Amount', selectedPipelineItem.totalAmount > 0 ? formatCurrency(selectedPipelineItem.totalAmount) : null)}
              {renderTransactionDetailRow('Amount Paid', selectedPipelineItem.amountReceived > 0 ? formatCurrency(selectedPipelineItem.amountReceived) : null)}
              {renderTransactionDetailRow('Remaining Balance', selectedPipelineItem.remainingBalance > 0 ? formatCurrency(selectedPipelineItem.remainingBalance) : null)}
            </View>
            <Text style={{ color: '#6B7280', fontSize: 12, lineHeight: 18 }}>This is a quick sales view. Use the Orders or Requests tab if you need to change the order status, payment, rider, or item details.</Text>
          </>
        ) : null,
      })}

      <Modal visible={calendarModalVisible} animationType="fade" transparent onRequestClose={() => setCalendarModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { width: isWeb ? 420 : Math.min(width - 24, 420) }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.modalTitle}>{calendarTarget === 'end' ? 'Select end date' : 'Select start date'}</Text>
                <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>
                  Future dates are disabled. We will keep the selected range valid automatically.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCalendarModalVisible(false)} style={{ padding: 6 }}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => changeCalendarMonth(-1)} style={{ padding: 8 }}>
                <Ionicons name="chevron-back" size={20} color="#111827" />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                {calendarMonthDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => changeCalendarMonth(1)} disabled={!canGoToNextCalendarMonth} style={{ padding: 8, opacity: canGoToNextCalendarMonth ? 1 : 0.35 }}>
                <Ionicons name="chevron-forward" size={20} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              {DAY_LABELS.map((label) => (
                <View key={label} style={{ width: '14.2857%', alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#9CA3AF' }}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {calendarDays.map((day, index) => {
                if (!day) {
                  return <View key={`empty-${index}`} style={{ width: '14.2857%', padding: 4 }} />;
                }

                const isSelectedTarget = day.key === (calendarTarget === 'end' ? selectedRangeDetails.endKey : selectedRangeDetails.startKey);
                const isBoundary = day.key === selectedRangeDetails.startKey || day.key === selectedRangeDetails.endKey;
                const isInRange = day.key >= selectedRangeDetails.startKey && day.key <= selectedRangeDetails.endKey;
                const isToday = day.key === todayKey;
                const backgroundColor = isSelectedTarget
                  ? '#EC4899'
                  : isBoundary
                    ? '#F9A8D4'
                    : isInRange
                      ? '#FDF2F8'
                      : '#fff';
                const borderColor = isToday
                  ? '#EC4899'
                  : isBoundary
                    ? '#F472B6'
                    : '#E5E7EB';

                return (
                  <View key={day.key} style={{ width: '14.2857%', padding: 4 }}>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      disabled={day.isDisabled}
                      onPress={() => handleCalendarPick(day.key)}
                      style={{
                        minHeight: 42,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: day.isDisabled ? 0.35 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isSelectedTarget ? '#fff' : '#111827' }}>
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setCalendarModalVisible(false)}
              >
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={() => handleCalendarPick(todayKey)}
              >
                <Text style={styles.buttonText}>Pick Today</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={exportModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Export Options</Text>
            <Text style={{ marginTop: 10, marginBottom: 10, color: '#6B7280' }}>
              Exporting the current dashboard filter:{' '}
              <Text style={{ fontWeight: '700', color: '#111827' }}>
                {currentPeriodLabel}
              </Text>
            </Text>
            <Text style={{ marginTop: 15, marginBottom: 5, fontWeight: 'bold' }}>Include Sections</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>Overview</Text>
              <Switch value={exportOptions.overview} onValueChange={(value) => setExportOptions((prev) => ({ ...prev, overview: value }))} trackColor={{ false: '#767577', true: '#fbcfe8' }} thumbColor={exportOptions.overview ? '#ec4899' : '#f4f3f4'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>Follow-Up</Text>
              <Switch value={exportOptions.followUp} onValueChange={(value) => setExportOptions((prev) => ({ ...prev, followUp: value }))} trackColor={{ false: '#767577', true: '#fbcfe8' }} thumbColor={exportOptions.followUp ? '#ec4899' : '#f4f3f4'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>Products</Text>
              <Switch value={exportOptions.products} onValueChange={(value) => setExportOptions((prev) => ({ ...prev, products: value }))} trackColor={{ false: '#767577', true: '#fbcfe8' }} thumbColor={exportOptions.products ? '#ec4899' : '#f4f3f4'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
              <Text>History</Text>
              <Switch value={exportOptions.history} onValueChange={(value) => setExportOptions((prev) => ({ ...prev, history: value }))} trackColor={{ false: '#767577', true: '#fbcfe8' }} thumbColor={exportOptions.history ? '#ec4899' : '#f4f3f4'} />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setExportModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleExportReport}>
                <Text style={styles.buttonText}>Generate PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default SalesTab;
