import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Switch,
  RefreshControl,
  ScrollView,
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

const formatMonthKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
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

const buildYearMonthOptions = (year = new Date().getFullYear()) => Array.from({ length: 12 }, (_, index) => {
  const date = new Date(year, index, 1);

  return {
    key: formatMonthKey(date),
    label: date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
    fullLabel: date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
  };
});

const SalesTab = () => {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const [salesData, setSalesData] = useState({
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
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{ data: [] }],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [selectedMonthKey, setSelectedMonthKey] = useState(formatMonthKey(new Date()));
  const [bestSellers, setBestSellers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expandedTxn, setExpandedTxn] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    summary: true,
    bestSellers: true,
    transactions: true,
    period: 'week'
  });
  const monthOptions = React.useMemo(() => buildYearMonthOptions(new Date().getFullYear()), []);
  const selectedMonthOption = monthOptions.find((option) => option.key === selectedMonthKey) || monthOptions[0];

  useEffect(() => {
    loadAllData();

    const subscription = supabase
      .channel('sales-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { loadAllData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadAllData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => { loadAllData(); })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedPeriod, selectedMonthKey]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSalesData(),
        loadBestSellers(),
        loadTransactions(),
      ]);
    } catch (error) {
      console.error('Error loading sales tab data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSalesData = async () => {
    try {
      const activeMonthKey = selectedPeriod === 'month' ? selectedMonthKey : null;
      const selectedMonthRange = selectedPeriod === 'month' ? getMonthRange(selectedMonthKey) : null;
      const summaryRes = await adminAPI.getSalesSummary({ period: selectedPeriod, monthKey: activeMonthKey });
      if (summaryRes.error) throw summaryRes.error;
      const summary = summaryRes.data;

      setSalesData({
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
      });

      // Process data for chart
      const chartRes = await adminAPI.getSalesChartData(selectedPeriod, activeMonthKey);
      if (chartRes.error) throw chartRes.error;
      const allSales = chartRes.data || [];

      let labels = [];
      let data = [];

      if (selectedPeriod === 'today') {
        labels = ['12AM', '4AM', '8AM', '12PM', '4PM', '8PM'];
        data = Array(6).fill(0);

        allSales.forEach((sale) => {
          const saleDate = new Date(sale.sale_date);
          const hour = saleDate.getHours();
          const bucketIndex = Math.min(5, Math.max(0, Math.floor(hour / 4)));
          data[bucketIndex] += parseFloat(sale.total_amount || 0);
        });
      } else if (selectedPeriod === 'week') {
        const toDateString = (date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };

        const dailyData = new Map();
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

        const monday = new Date(today);
        monday.setDate(today.getDate() + diff);
        monday.setHours(0, 0, 0, 0);

        for (let i = 0; i < 7; i++) {
          const day = new Date(monday);
          day.setDate(monday.getDate() + i);
          dailyData.set(toDateString(day), 0);
        }

        allSales.forEach(sale => {
          const saleDate = new Date(sale.sale_date);
          const saleDateString = toDateString(saleDate);
          if (dailyData.has(saleDateString)) {
            dailyData.set(saleDateString, dailyData.get(saleDateString) + parseFloat(sale.total_amount || 0));
          }
        });
        data = Array.from(dailyData.values());

      } else if (selectedPeriod === 'month' && selectedMonthRange) {
        const totalDays = Math.max(1, Math.ceil((selectedMonthRange.end - selectedMonthRange.start) / (1000 * 60 * 60 * 24)));
        const weekCount = Math.max(4, Math.ceil(totalDays / 7));
        labels = Array.from({ length: weekCount }, (_, index) => `Week ${index + 1}`);
        data = Array(weekCount).fill(0);

        allSales.forEach(sale => {
          const saleDate = new Date(sale.sale_date);
          if (saleDate >= selectedMonthRange.start && saleDate < selectedMonthRange.end) {
            const diffDays = Math.floor((saleDate - selectedMonthRange.start) / (1000 * 60 * 60 * 24));
            const weekIndex = Math.min(weekCount - 1, Math.floor(diffDays / 7));
            data[weekIndex] += parseFloat(sale.total_amount || 0);
          }
        });
      } else {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthTotals = Array(12).fill(0);
        const currentYear = new Date().getFullYear();
        allSales.forEach(sale => {
          const saleDate = new Date(sale.sale_date);
          if (saleDate.getFullYear() === currentYear) {
            const monthIndex = saleDate.getMonth();
            monthTotals[monthIndex] += parseFloat(sale.total_amount || 0);
          }
        });
        data = monthTotals;
      }

      const allSame = data.length > 1 && data.every(val => val === data[0]);
      if (allSame) {
        data[data.length - 1] += 0.0001;
      }

      setChartData({
        labels,
        datasets: [{ data: data.length > 0 ? data : [0] }],
      });
    } catch (error) {
      console.error('Error loading sales data:', error);
      setSalesData({
        totalSales: 0, todaySales: 0, weekSales: 0, monthSales: 0,
        cashSales: 0, creditSales: 0, receivable: 0, upcomingSales: 0,
        totalOrders: 0, completedOrders: 0, pendingOrders: 0,
        unpaidCount: 0, upcomingCount: 0, outstandingItems: [], upcomingItems: [],
      });
      setChartData({
        labels: ['N/A'],
        datasets: [{ data: [0] }],
      });
    }
  };

  const loadBestSellers = async () => {
    try {
      const res = await adminAPI.getBestSellingProducts(
        selectedPeriod,
        selectedPeriod === 'month' ? selectedMonthKey : null
      );
      setBestSellers(res.data || []);
    } catch (error) {
      console.error('Error loading best sellers:', error);
      setBestSellers([]);
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await adminAPI.getTransactionHistory(
        selectedPeriod,
        selectedPeriod === 'month' ? selectedMonthKey : null
      );
      setTransactions(res.data || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-PH', {
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
    if (type === 'booking') return 'Booking';
    if (type === 'customized') return 'Custom';
    if (type === 'special_order') return 'Special';
    return 'Request';
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

  const renderPipelineItem = (item, section = 'unpaid') => {
    const sourceType = item.sourceType || (item.entityType === 'order' ? 'Order' : 'Request');
    const amountLabel = section === 'unpaid' ? 'Remaining' : 'Amount';
    const amountValue = section === 'unpaid' ? item.remainingBalance : item.totalAmount;

    return (
      <View
        key={item.id}
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
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#333' }} numberOfLines={1}>
                #{item.refNumber}
              </Text>
              <View style={{
                backgroundColor: getSourceBadgeColor(sourceType),
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                  {getSourceLabel(sourceType)}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{item.customerName}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
              {item.scheduleText || 'Active record'}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              {formatDate(item.scheduleDate || new Date())}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', minWidth: 120 }}>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{amountLabel}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: section === 'unpaid' ? '#DC2626' : '#16A34A' }}>
              {formatCurrency(amountValue)}
            </Text>
            {section === 'unpaid' && (
              <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                Due {formatCurrency(item.totalAmount)}
              </Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <View style={{
            backgroundColor: `${getStatusBadgeColor(item.status)}18`,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: getStatusBadgeColor(item.status) }}>
              {getStatusLabel(item.status)}
            </Text>
          </View>

          <View style={{
            backgroundColor: `${getStatusBadgeColor(item.paymentStatus)}18`,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: getStatusBadgeColor(item.paymentStatus) }}>
              {getPaymentStatusDisplay(item.paymentStatus)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const openExportModal = () => {
    setExportOptions(prev => ({ ...prev, period: selectedPeriod }));
    setExportModalVisible(true);
  };

  const handleExportReport = async () => {
    setExportModalVisible(false); // Close modal
    setExporting(true);

    const { summary, bestSellers: showBestSellers, transactions: showTransactions } = exportOptions;
    const period = selectedPeriod;

    try {
      const currentSales = salesData.cashSales;

      const periodLabel = period === 'month' && selectedMonthOption
        ? selectedMonthOption.fullLabel
        : period.charAt(0).toUpperCase() + period.slice(1);
      const dateGenerated = new Date().toLocaleDateString('en-PH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const bestSellerRows = bestSellers.map((p, i) => `
        <tr>
          <td style="padding: 8px; text-align: center; font-weight: ${i === 0 ? 'bold' : 'normal'}; color: ${i === 0 ? '#D97706' : '#333'};">
            ${i === 0 ? '🏆 ' : ''}#${i + 1}
          </td>
          <td style="padding: 8px;">${p.name}</td>
          <td style="padding: 8px; text-align: center;">${p.total_sold}</td>
          <td style="padding: 8px; text-align: right;">₱${p.total_revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('');

      const transactionRows = transactions.map(t => `
        <tr>
          <td style="padding: 6px 8px; font-size: 11px;">${new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td style="padding: 6px 8px; font-size: 11px;">${t.refNumber}</td>
          <td style="padding: 6px 8px; font-size: 11px;">${getSourceLabel(t.sourceType)}</td>
          <td style="padding: 6px 8px; font-size: 11px;">${t.customerName}</td>
          <td style="padding: 6px 8px; text-align: right; font-size: 11px; font-weight: 600;">₱${t.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('');

      const html = `
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #333; }
            h1 { color: #EC4899; margin-bottom: 5px; }
            h2 { color: #333; border-bottom: 2px solid #EC4899; padding-bottom: 5px; margin-top: 30px; }
            .subtitle { color: #666; font-size: 13px; margin-bottom: 25px; }
            .summary-grid { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
            .summary-card { flex: 1; min-width: 120px; border: 1px solid #eee; border-radius: 10px; padding: 15px; text-align: center; }
            .summary-card .value { font-size: 22px; font-weight: bold; color: #333; }
            .summary-card .label { font-size: 11px; color: #888; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f8f8f8; padding: 10px 8px; text-align: left; font-size: 12px; color: #666; border-bottom: 2px solid #eee; }
            td { border-bottom: 1px solid #f0f0f0; }
            tr:nth-child(even) { background: #fafafa; }
            .footer { text-align: center; color: #bbb; font-size: 11px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>Jocery's Flower Shop</h1>
          <p class="subtitle">Sales Report — ${periodLabel} | Generated: ${dateGenerated}</p>

          
          ${summary ? `
          <h2>Sales Summary</h2>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="value">₱${currentSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              <div class="label">${periodLabel} Cash Sales</div>
            </div>
            <div class="summary-card">
              <div class="value">â‚±${salesData.creditSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              <div class="label">Credit Sales</div>
            </div>
            <div class="summary-card">
              <div class="value">â‚±${salesData.receivable.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              <div class="label">Receivable</div>
            </div>
            <div class="summary-card">
              <div class="value">â‚±${salesData.upcomingSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              <div class="label">Upcoming Sales</div>
            </div>
            <div class="summary-card">
              <div class="value">${salesData.unpaidCount}</div>
              <div class="label">Orders Not Yet Paid</div>
            </div>
            <div class="summary-card">
              <div class="value">${salesData.upcomingCount}</div>
              <div class="label">Upcoming Orders</div>
            </div>
          </div>
          ` : ''}

          ${showBestSellers && bestSellers.length > 0 ? `
            <h2>Best Selling Products</h2>
            <table>
              <thead>
                <tr>
                  <th style="text-align: center;">Rank</th>
                  <th>Product</th>
                  <th style="text-align: center;">Units Sold</th>
                  <th style="text-align: right;">Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${bestSellerRows}
              </tbody>
            </table>
          ` : ''}

          ${showTransactions && transactions.length > 0 ? `
            <h2>Transaction History</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Customer</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${transactionRows}
              </tbody>
            </table>
          ` : ''}


        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Sales Report',
          UTI: 'com.adobe.pdf',
        });
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

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading sales data...</Text>
      </View>
    );
  }

  const currentSales = salesData.cashSales;
  const currentSalesLabel = selectedPeriod === 'all'
    ? 'Cash Sales'
    : selectedPeriod === 'month' && selectedMonthOption
      ? `Cash Sales (${selectedMonthOption.fullLabel})`
      : `Cash Sales (${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)})`;

  return (
    <>
      <ScrollView
        style={styles.tabContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
      >
        {/* Header with Export Button */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <Text style={styles.tabTitle}>Sales Dashboard</Text>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#ec4899',
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 20,
              gap: 6,
              elevation: 2,
            }}
            onPress={openExportModal}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="document-text-outline" size={16} color="#fff" />
            )}
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
              {exporting ? 'Generating...' : 'Export PDF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Period Filter */}
        <View style={styles.filterContainer}>
          <Text style={styles.filterLabel}>Period:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {['today', 'week', 'month', 'all'].map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.categoryChip,
                  selectedPeriod === period && styles.categoryChipActive
                ]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text style={[
                  styles.categoryChipText,
                  selectedPeriod === period && styles.categoryChipTextActive
                ]}>
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedPeriod === 'month' && (
          <View style={styles.filterContainer}>
            <Text style={styles.filterLabel}>Month:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {monthOptions.map((monthOption) => (
                <TouchableOpacity
                  key={monthOption.key}
                  style={[
                    styles.categoryChip,
                    selectedMonthKey === monthOption.key && styles.categoryChipActive
                  ]}
                  onPress={() => setSelectedMonthKey(monthOption.key)}
                >
                  <Text style={[
                    styles.categoryChipText,
                    selectedMonthKey === monthOption.key && styles.categoryChipTextActive
                  ]}>
                    {monthOption.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Sales Chart */}
        <View style={{
          marginVertical: 8,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#eee',
          overflow: 'hidden',
          alignSelf: 'center'
        }}>
          <LineChart
            data={chartData}
            width={width - 32}
            height={220}
            yAxisLabel="₱"
            chartConfig={{
              backgroundColor: "#fff",
              backgroundGradientFrom: "#fff",
              backgroundGradientTo: "#fff",
              decimalPlaces: 2,
              color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: {
                borderRadius: 16
              },
              propsForDots: {
                r: "6",
                strokeWidth: "2",
                stroke: "#ec4899"
              },
              formatYLabel: (yLabel) => `₱${parseFloat(yLabel).toFixed(0)}`,
              yLabelsOffset: 40,
            }}
            bezier
            withDots={!isWeb}
          />
        </View>
        <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>
          Chart and transaction history show recorded completed sales. The cards below show live cash, credit, receivable, and upcoming amounts.
        </Text>

        {/* Sales Summary Cards */}
        <View style={styles.salesSummaryContainer}>
          <View style={styles.salesCard}>
            <Ionicons name="cash" size={32} color="#4CAF50" />
            <Text style={styles.salesCardValue}>{formatCurrency(currentSales)}</Text>
            <Text style={styles.salesCardLabel}>{currentSalesLabel}</Text>
          </View>

          <View style={styles.salesCard}>
            <Ionicons name="card" size={32} color="#2563EB" />
            <Text style={styles.salesCardValue}>{formatCurrency(salesData.creditSales)}</Text>
            <Text style={styles.salesCardLabel}>Credit Sales</Text>
          </View>
        </View>

        <View style={styles.salesSummaryContainer}>
          <View style={styles.salesCard}>
            <Ionicons name="wallet" size={32} color="#DC2626" />
            <Text style={styles.salesCardValue}>{formatCurrency(salesData.receivable)}</Text>
            <Text style={styles.salesCardLabel}>Receivable</Text>
          </View>

          <View style={styles.salesCard}>
            <Ionicons name="calendar" size={32} color="#F59E0B" />
            <Text style={styles.salesCardValue}>{formatCurrency(salesData.upcomingSales)}</Text>
            <Text style={styles.salesCardLabel}>Upcoming Sales</Text>
          </View>
        </View>

        <View style={styles.salesSummaryContainer}>
          <View style={styles.salesCard}>
            <Ionicons name="alert-circle" size={32} color="#DC2626" />
            <Text style={styles.salesCardValue}>{salesData.unpaidCount}</Text>
            <Text style={styles.salesCardLabel}>Orders Not Yet Paid</Text>
          </View>

          <View style={styles.salesCard}>
            <Ionicons name="time" size={32} color="#0891B2" />
            <Text style={styles.salesCardValue}>{salesData.upcomingCount}</Text>
            <Text style={styles.salesCardLabel}>Upcoming Orders</Text>
          </View>
        </View>

        <View style={{
          backgroundColor: '#fff',
          borderRadius: 14,
          padding: 15,
          marginBottom: 16,
          elevation: 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 14 }}>
            Sales Snapshot
          </Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total records</Text>
            <Text style={styles.statValue}>{salesData.totalOrders}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Completed</Text>
            <Text style={styles.statValue}>{salesData.completedOrders}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Active / pending</Text>
            <Text style={styles.statValue}>{salesData.pendingOrders}</Text>
          </View>
          <View style={styles.statRowTotal}>
            <Text style={styles.statLabelTotal}>Receivable vs cash</Text>
            <Text style={styles.statValueTotal}>
              {formatCurrency(salesData.receivable)} / {formatCurrency(currentSales)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 4, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Ionicons name="wallet-outline" size={22} color="#DC2626" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Orders Not Yet Paid</Text>
            <View style={{
              backgroundColor: '#FEE2E2',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginLeft: 'auto',
            }}>
              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700' }}>
                {salesData.unpaidCount}
              </Text>
            </View>
          </View>

          {salesData.outstandingItems.length === 0 ? (
            <View style={{
              backgroundColor: '#fff', borderRadius: 12, padding: 25,
              alignItems: 'center', elevation: 1,
            }}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color="#ddd" />
              <Text style={{ color: '#999', marginTop: 8 }}>No unpaid orders for this filter</Text>
            </View>
          ) : (
            salesData.outstandingItems.map((item) => renderPipelineItem(item, 'unpaid'))
          )}
        </View>

        <View style={{ marginTop: 4, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Ionicons name="calendar-outline" size={22} color="#F59E0B" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Upcoming Sales</Text>
            <View style={{
              backgroundColor: '#FEF3C7',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginLeft: 'auto',
            }}>
              <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '700' }}>
                {salesData.upcomingCount}
              </Text>
            </View>
          </View>

          {salesData.upcomingItems.length === 0 ? (
            <View style={{
              backgroundColor: '#fff', borderRadius: 12, padding: 25,
              alignItems: 'center', elevation: 1,
            }}>
              <Ionicons name="calendar-clear-outline" size={40} color="#ddd" />
              <Text style={{ color: '#999', marginTop: 8 }}>No upcoming sales for this filter</Text>
            </View>
          ) : (
            salesData.upcomingItems.map((item) => renderPipelineItem(item, 'upcoming'))
          )}
        </View>

        {/* ========== Best Selling Products ========== */}
        <View style={{ marginTop: 10, marginBottom: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Ionicons name="trophy" size={22} color="#D97706" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Best Selling Products</Text>
          </View>

          {bestSellers.length === 0 ? (
            <View style={{
              backgroundColor: '#fff', borderRadius: 12, padding: 25,
              alignItems: 'center', elevation: 1,
            }}>
              <Ionicons name="flower-outline" size={40} color="#ddd" />
              <Text style={{ color: '#999', marginTop: 8 }}>No sales data yet</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={bestSellers}
              keyExtractor={(item) => String(item.product_id)}
              renderItem={({ item, index }) => (
                <View style={{
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  padding: 12,
                  marginRight: 12,
                  width: 140,
                  alignItems: 'center',
                  elevation: 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  borderWidth: index === 0 ? 2 : 0,
                  borderColor: index === 0 ? '#D97706' : 'transparent',
                }}>
                  {/* Rank badge */}
                  <View style={{
                    position: 'absolute', top: 8, left: 8,
                    backgroundColor: index === 0 ? '#D97706' : index === 1 ? '#9CA3AF' : index === 2 ? '#B45309' : '#D1D5DB',
                    borderRadius: 10, width: 22, height: 22,
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                      {index + 1}
                    </Text>
                  </View>

                  {/* Product image */}
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 8, marginTop: 4 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{
                      width: 60, height: 60, borderRadius: 30, marginBottom: 8, marginTop: 4,
                      backgroundColor: '#fce4ec', justifyContent: 'center', alignItems: 'center',
                    }}>
                      <Ionicons name="flower" size={28} color="#ec4899" />
                    </View>
                  )}

                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#333', textAlign: 'center' }}
                    numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#ec4899', marginTop: 4 }}>
                    {item.total_sold}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#888' }}>units sold</Text>
                  <Text style={{ fontSize: 11, color: '#4CAF50', fontWeight: '600', marginTop: 2 }}>
                    {formatCurrency(item.total_revenue)}
                  </Text>
                </View>
              )}
            />
          )}
        </View>

        {/* ========== Transaction History ========== */}
        <View style={{ marginTop: 5, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Ionicons name="receipt" size={22} color="#3B82F6" />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Transaction History</Text>
            <View style={{
              backgroundColor: '#EFF6FF', borderRadius: 10,
              paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto',
            }}>
              <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600' }}>
                {transactions.length} records
              </Text>
            </View>
          </View>

          {transactions.length === 0 ? (
            <View style={{
              backgroundColor: '#fff', borderRadius: 12, padding: 25,
              alignItems: 'center', elevation: 1,
            }}>
              <Ionicons name="receipt-outline" size={40} color="#ddd" />
              <Text style={{ color: '#999', marginTop: 8 }}>No transactions for this period</Text>
            </View>
          ) : (
            transactions.map((txn) => (
              <TouchableOpacity
                key={txn.id}
                activeOpacity={0.7}
                onPress={() => setExpandedTxn(expandedTxn === txn.id ? null : txn.id)}
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
                  borderLeftWidth: 4,
                  borderLeftColor: getSourceBadgeColor(txn.sourceType),
                }}
              >
                {/* Top row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#333', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="middle">
                        #{txn.refNumber}
                      </Text>
                      <View style={{
                        backgroundColor: getSourceBadgeColor(txn.sourceType),
                        borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                          {getSourceLabel(txn.sourceType)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: '#888' }}>
                      {txn.customerName}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4CAF50' }}>
                      {formatCurrency(txn.amount)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                      {formatDate(txn.date)}
                    </Text>
                  </View>
                </View>

                {/* Expandable items */}
                {expandedTxn === txn.id && txn.items.length > 0 && (
                  <View style={{
                    marginTop: 10, paddingTop: 10,
                    borderTopWidth: 1, borderTopColor: '#f0f0f0',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6 }}>
                      Items
                    </Text>
                    {txn.items.map((item, idx) => (
                      <View key={idx} style={{
                        flexDirection: 'row', justifyContent: 'space-between',
                        paddingVertical: 3,
                      }}>
                        <Text style={{ fontSize: 12, color: '#555', flex: 1 }}>
                          {item.name} × {item.quantity}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#555', fontWeight: '500' }}>
                          {formatCurrency(item.price * item.quantity)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Expand indicator */}
                {txn.items.length > 0 && (
                  <View style={{ alignItems: 'center', marginTop: 6 }}>
                    <Ionicons
                      name={expandedTxn === txn.id ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#ccc"
                    />
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 50 }} />
        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Export Options Modal */}
      <Modal visible={exportModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Export Options</Text>

            <Text style={{ marginTop: 10, marginBottom: 10, color: '#6B7280' }}>
              Exporting the current dashboard filter:
              {' '}
              <Text style={{ fontWeight: '700', color: '#111827' }}>
                {selectedPeriod === 'month' && selectedMonthOption ? selectedMonthOption.fullLabel : selectedPeriod}
              </Text>
            </Text>

            <Text style={{ marginTop: 15, marginBottom: 5, fontWeight: 'bold' }}>Include Sections</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>Sales Summary</Text>
              <Switch
                value={exportOptions.summary}
                onValueChange={v => setExportOptions(prev => ({ ...prev, summary: v }))}
                trackColor={{ false: "#767577", true: "#fbcfe8" }}
                thumbColor={exportOptions.summary ? "#ec4899" : "#f4f3f4"}
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>Best Sellers</Text>
              <Switch
                value={exportOptions.bestSellers}
                onValueChange={v => setExportOptions(prev => ({ ...prev, bestSellers: v }))}
                trackColor={{ false: "#767577", true: "#fbcfe8" }}
                thumbColor={exportOptions.bestSellers ? "#ec4899" : "#f4f3f4"}
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
              <Text>Transaction History</Text>
              <Switch
                value={exportOptions.transactions}
                onValueChange={v => setExportOptions(prev => ({ ...prev, transactions: v }))}
                trackColor={{ false: "#767577", true: "#fbcfe8" }}
                thumbColor={exportOptions.transactions ? "#ec4899" : "#f4f3f4"}
              />
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

