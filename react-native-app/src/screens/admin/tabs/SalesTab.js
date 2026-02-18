import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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

const SalesTab = () => {
  const { width } = useWindowDimensions();
  const [salesData, setSalesData] = useState({
    totalSales: 0,
    todaySales: 0,
    weekSales: 0,
    monthSales: 0,
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
  });
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{ data: [] }],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [bestSellers, setBestSellers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expandedTxn, setExpandedTxn] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    summary: true,
    bestSellers: true,
    transactions: true,
    period: 'week' // Default period for export
  });

  useEffect(() => {
    loadAllData();

    const subscription = supabase
      .channel('sales-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },
        () => { loadAllData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedPeriod]);

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
      const summaryRes = await adminAPI.getSalesSummary();
      if (summaryRes.error) throw summaryRes.error;
      const summary = summaryRes.data;

      setSalesData({
        totalSales: summary.totalSales,
        todaySales: summary.todaySales,
        weekSales: summary.weekSales,
        monthSales: summary.monthSales,
        totalOrders: summary.totalOrders,
        completedOrders: summary.completedOrders,
        pendingOrders: summary.pendingOrders,
      });

      // Process data for chart
      const chartRes = await adminAPI.getSalesChartData();
      if (chartRes.error) throw chartRes.error;
      const allSales = chartRes.data || [];

      let labels = [];
      let data = [];

      if (selectedPeriod === 'week') {
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

      } else if (selectedPeriod === 'month') {
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        data = [0, 0, 0, 0];
        const now = new Date();

        allSales.forEach(sale => {
          const saleDate = new Date(sale.sale_date);
          const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays < 28) {
            const weekIndex = Math.floor(diffDays / 7);
            if (weekIndex >= 0 && weekIndex < 4) {
              data[weekIndex] += parseFloat(sale.total_amount || 0);
            }
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
        totalOrders: 0, completedOrders: 0, pendingOrders: 0,
      });
      setChartData({
        labels: ['N/A'],
        datasets: [{ data: [0] }],
      });
    }
  };

  const loadBestSellers = async () => {
    try {
      const res = await adminAPI.getBestSellingProducts();
      setBestSellers(res.data || []);
    } catch (error) {
      console.error('Error loading best sellers:', error);
      setBestSellers([]);
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await adminAPI.getTransactionHistory(selectedPeriod);
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

  const openExportModal = () => {
    setExportOptions(prev => ({ ...prev, period: selectedPeriod }));
    setExportModalVisible(true);
  };

  const handleExportReport = async () => {
    setExportModalVisible(false); // Close modal
    setExporting(true);

    const { summary, bestSellers: showBestSellers, transactions: showTransactions, period } = exportOptions;

    try {
      const currentSales = period === 'today' ? salesData.todaySales :
        period === 'week' ? salesData.weekSales :
          period === 'month' ? salesData.monthSales :
            salesData.totalSales;

      const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
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
          <h1>🌸 Jocery's Flower Shop</h1>
          <p class="subtitle">Sales Report — ${periodLabel} | Generated: ${dateGenerated}</p>

          
          ${summary ? `
          <h2>📊 Sales Summary</h2>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="value">₱${currentSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
              <div class="label">${periodLabel} Sales</div>
            </div>
            <div class="summary-card">
              <div class="value">${salesData.totalOrders}</div>
              <div class="label">Total Orders</div>
            </div>
            <div class="summary-card">
              <div class="value">${salesData.completedOrders}</div>
              <div class="label">Completed</div>
            </div>
            <div class="summary-card">
              <div class="value">${salesData.pendingOrders}</div>
              <div class="label">Pending</div>
            </div>
          </div>
          ` : ''}

          ${showBestSellers && bestSellers.length > 0 ? `
            <h2>🏆 Best Selling Products</h2>
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
            <h2>📋 Transaction History</h2>
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

          <div class="footer">
            Jocery's Flower Shop — Sales Report. This document was auto-generated.
          </div>
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
      </View>
    );
  }

  const currentSales = selectedPeriod === 'today' ? salesData.todaySales :
    selectedPeriod === 'week' ? salesData.weekSales :
      selectedPeriod === 'month' ? salesData.monthSales :
        salesData.totalSales;

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
            {['week', 'month', 'all'].map((period) => (
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
          />
        </View>

        {/* Sales Summary Cards */}
        <View style={styles.salesSummaryContainer}>
          <View style={styles.salesCard}>
            <Ionicons name="cash" size={32} color="#4CAF50" />
            <Text style={styles.salesCardValue}>{formatCurrency(currentSales)}</Text>
            <Text style={styles.salesCardLabel}>
              {selectedPeriod === 'all' ? 'Total Sales' : `Sales (${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)})`}
            </Text>
          </View>

          <View style={styles.salesCard}>
            <Ionicons name="cart" size={32} color="#2196F3" />
            <Text style={styles.salesCardValue}>{salesData.totalOrders}</Text>
            <Text style={styles.salesCardLabel}>Total Orders</Text>
          </View>
        </View>

        <View style={styles.salesSummaryContainer}>
          <View style={styles.salesCard}>
            <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
            <Text style={styles.salesCardValue}>{salesData.completedOrders}</Text>
            <Text style={styles.salesCardLabel}>Completed</Text>
          </View>

          <View style={styles.salesCard}>
            <Ionicons name="time" size={32} color="#FF9800" />
            <Text style={styles.salesCardValue}>{salesData.pendingOrders}</Text>
            <Text style={styles.salesCardLabel}>Pending</Text>
          </View>
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
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#333' }}>
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

            <Text style={{ marginTop: 10, marginBottom: 5, fontWeight: 'bold' }}>Period</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['today', 'week', 'month', 'year'].map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setExportOptions(prev => ({ ...prev, period: p }))}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                    backgroundColor: exportOptions.period === p ? '#ec4899' : '#f3f4f6'
                  }}
                >
                  <Text style={{ color: exportOptions.period === p ? '#fff' : '#333', textTransform: 'capitalize' }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

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
