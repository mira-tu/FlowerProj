import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
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

  useEffect(() => {
    loadSalesData();

    const subscription = supabase
      .channel('sales-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },
        (payload) => {
          loadSalesData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedPeriod]);

  const loadSalesData = async () => {
    setLoading(true);
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
        }

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
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4']; // Week 1 is most recent
        data = [0, 0, 0, 0];

        const now = new Date();
        
        allSales.forEach(sale => {
            const saleDate = new Date(sale.sale_date);
            const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays >= 0 && diffDays < 28) {
                const weekIndex = Math.floor(diffDays / 7); // 0 for last 7 days, 1 for 7-13 days ago, etc.
                if (weekIndex >= 0 && weekIndex < 4) {
                    data[weekIndex] += parseFloat(sale.total_amount || 0);
                }
            }
        });

      } else { // 'all'
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
    } finally {
      setLoading(false);
    }
  };
  
  const onRefresh = async () => {
    setRefreshing(true);
    await loadSalesData();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount).toFixed(2)}`;
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
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
      }
    >
      <Text style={styles.tabTitle}>Sales Dashboard</Text>

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
      <View style={{ height: 50 }} />
    </ScrollView>
  );
};


export default SalesTab;
