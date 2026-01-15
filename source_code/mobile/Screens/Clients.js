import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  ScrollView
} from 'react-native';
import { Card, Button } from 'react-native-paper';
import config from '../config.json';
import { useFocusEffect } from '@react-navigation/native';

const Clients = ({ userId, isNewUser }) => {
  if (isNewUser) return null;

  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('All Time');
  const [showYearPicker, setShowYearPicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
      return () => {};
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])
  );

  // Generate available years based on job data
  useEffect(() => {
    if (clients.length > 0) {
      const years = new Set();
      const currentYear = new Date().getFullYear();

      years.add(currentYear);

      clients.forEach((client) => {
        client.jobs.forEach((job) => {
          (job.transactions || []).forEach((tx) => {
            const txYear = new Date(tx.date).getFullYear();
            years.add(txYear);
          });
        });
      });

      const sortedYears = ['All Time', ...Array.from(years).sort((a, b) => b - a)];
      setAvailableYears(sortedYears);
    } else {
      setAvailableYears(['All Time', new Date().getFullYear()]);
    }
  }, [clients]);

  function fetchJobs() {
    fetch(`${config.app.api}/jobs?userId=${userId}`)
      .then((res) => res.json())
      .then((jobs) => {
        const clientMap = {};

        (jobs || []).forEach((job) => {
          const clientName = job.client || 'Unknown Client';
          if (!clientMap[clientName]) {
            clientMap[clientName] = {
              name: clientName,
              jobs: [],
              totalIncome: 0,
              totalExpenses: 0,
            };
          }
          clientMap[clientName].jobs.push(job);
        });

        const processedClients = Object.values(clientMap)
          .map((client) => {
            client.totalIncome = client.jobs.reduce(
              (total, job) =>
                total +
                (job.transactions || [])
                  .filter((tx) => tx.type === 'income')
                  .reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
              0
            );

            client.totalExpenses = client.jobs.reduce(
              (total, job) =>
                total +
                (job.transactions || [])
                  .filter((tx) => tx.type === 'expense')
                  .reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
              0
            );

            return client;
          })
          .sort((a, b) => {
            const aRevenue = a.totalIncome - a.totalExpenses;
            const bRevenue = b.totalIncome - b.totalExpenses;
            return aRevenue - bRevenue;
          });

        setClients(processedClients);
      })
      .catch((err) => console.error('Failed to fetch jobs', err));
  }

  // Calculate job totals for a specific year
  const calculateJobTotals = useCallback((jobs, year) => {
    return (jobs || []).reduce(
      (totals, job) => {
        let yearTransactions = job.transactions || [];

        if (year !== 'All Time') {
          const startOfYear = new Date(year, 0, 1);
          const endOfYear = new Date(year, 11, 31, 23, 59, 59);
          yearTransactions = yearTransactions.filter((tx) => {
            const txDate = new Date(tx.date);
            return txDate >= startOfYear && txDate <= endOfYear;
          });
        }

        totals.income += yearTransactions
          .filter((tx) => tx.type === 'income')
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

        totals.expenses += yearTransactions
          .filter((tx) => tx.type === 'expense')
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

        return totals;
      },
      { income: 0, expenses: 0 }
    );
  }, []);

  // Format date to MM/DD
  const formatDate = (date) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate().toString().padStart(2, '0')}`;
  };

  // ===== Subcomponent: Job Transaction List (uses FlatList for both columns) =====
  const JobTransactionList = ({ job, year }) => {
  const TX_LIST_HEIGHT = 200;

  const yearTransactions = useMemo(() => {
    let txs = job.transactions || [];
    if (year === 'All Time') return txs;

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);
    return txs.filter((tx) => {
      const txDate = new Date(tx.date);
      return txDate >= startOfYear && txDate <= endOfYear;
    });
  }, [job.transactions, year]);

  const incomeTx = useMemo(() => {
    return yearTransactions
      .filter((tx) => tx.type === 'income')
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [yearTransactions]);

  const expenseTx = useMemo(() => {
    return yearTransactions
      .filter((tx) => tx.type === 'expense')
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [yearTransactions]);

  const renderTxCard = (tx, isIncome, key) => (
    <Card key={key} style={{ margin: 3, padding: 10, backgroundColor: '#f8f8f8' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14 }}>{formatDate(tx.date)}</Text>
        <Text style={{ fontSize: 14, color: isIncome ? '#6750a4' : 'black' }}>
          ${Math.abs(Number(tx.amount || 0)).toFixed(2)}
        </Text>
      </View>

      {tx.note ? (
        <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>{tx.note}</Text>
      ) : null}
    </Card>
  );

  return (
    <View style={{ marginTop: 15, marginBottom: 20 }}>
      <Text
        style={{
          fontWeight: 'bold',
          fontSize: 16,
          marginBottom: 8,
          paddingBottom: 5,
          borderBottomWidth: 1,
          borderBottomColor: '#ddd',
        }}
      >
        {job.name}
      </Text>

      <View style={{ flexDirection: 'row' }}>
        {/* Income */}
        <View style={{ flex: 1, marginRight: 5 }}>
          <Text style={{ fontWeight: 'bold', color: '#6750a4', fontSize: 14 }}>
            Income
          </Text>

          <View style={{ height: TX_LIST_HEIGHT }}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              {incomeTx.length ? (
                incomeTx.map((tx, idx) =>
                  renderTxCard(tx, true, tx._id || `${job._id || job.name}-income-${idx}`)
                )
              ) : (
                <Text style={{ fontSize: 12, color: '#999', padding: 8 }}>No income</Text>
              )}
            </ScrollView>
          </View>
        </View>

        {/* Expenses */}
        <View style={{ flex: 1, marginLeft: 5 }}>
          <Text style={{ fontWeight: 'bold', color: 'black', fontSize: 14 }}>
            Expenses
          </Text>

          <View style={{ height: TX_LIST_HEIGHT }}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              {expenseTx.length ? (
                expenseTx.map((tx, idx) =>
                  renderTxCard(tx, false, tx._id || `${job._id || job.name}-expense-${idx}`)
                )
              ) : (
                <Text style={{ fontSize: 12, color: '#999', padding: 8 }}>No expenses</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
};



  // ===== Renderers =====

  const renderClientItem = ({ item: client }) => {
    const yearTotals = calculateJobTotals(client.jobs, selectedYear);
    const revenue = yearTotals.income - yearTotals.expenses;

    return (
      <TouchableOpacity onPress={() => setSelectedClient(client)}>
        <Card
          style={{
            margin: 10,
            padding: 15,
            backgroundColor: revenue < 0 ? '#FFE5E5' : '#FFFFFF',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{client.name}</Text>
              <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                {client.jobs.length} Job{client.jobs.length !== 1 ? 's' : ''}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end', minWidth: 100 }}>
              <Text style={{ color: '#6750a4' }}>
                Income: ${yearTotals.income.toFixed(2)}
              </Text>
              <Text style={{ color: 'black' }}>
                Expenses: ${yearTotals.expenses.toFixed(2)}
              </Text>
              <Text style={{ color: '#6750a4', fontWeight: 'bold' }}>
                Revenue: ${revenue.toFixed(2)}
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const clientTotals = useMemo(() => {
    if (!selectedClient) return { income: 0, expenses: 0, revenue: 0 };
    const totals = calculateJobTotals(selectedClient.jobs, selectedYear);
    return { ...totals, revenue: totals.income - totals.expenses };
  }, [selectedClient, selectedYear, calculateJobTotals]);

  return (
    <View style={{ flex: 1 }}>
      {/* Year Selection */}
      <View style={{ padding: 10, backgroundColor: '#f0f0f0', alignItems: 'center' }}>
        <Button mode="outlined" onPress={() => setShowYearPicker(true)} style={{ marginBottom: 5 }}>
          {selectedYear} Clients Overview
        </Button>
      </View>

      {/* Clients List (FlatList instead of ScrollView) */}
      <FlatList
        data={clients}
        keyExtractor={(client, idx) => `${client.name}-${idx}`}
        renderItem={renderClientItem}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Client Details Modal (Pressable backdrop so it doesn't steal scroll) */}
      {selectedClient && (
        <Modal transparent visible animationType="fade">
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          >
            {/* Backdrop */}
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => setSelectedClient(null)}
            />

            {/* Modal content */}
            <View
              style={{
                width: '90%',
                height: '80%',
                backgroundColor: 'white',
                borderRadius: 10,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: 'bold',
                  marginBottom: 15,
                  textAlign: 'center',
                }}
              >
                {selectedClient.name}
              </Text>

              {/* Client Totals */}
              <Card style={{ marginBottom: 15, padding: 15, backgroundColor: '#f5f5f5' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 16 }}>Income</Text>
                    <Text style={{ fontSize: 16, color: '#6750a4' }}>
                      ${clientTotals.income.toFixed(2)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 16 }}>Expenses</Text>
                    <Text style={{ fontSize: 16, color: 'black' }}>
                      ${clientTotals.expenses.toFixed(2)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 16 }}>Revenue</Text>
                    <Text
                      style={{
                        fontSize: 16,
                        color: clientTotals.revenue >= 0 ? '#6750a4' : 'red',
                      }}
                    >
                      ${clientTotals.revenue.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Jobs List (FlatList instead of ScrollView) */}
              <FlatList
                data={selectedClient.jobs}
                keyExtractor={(job, idx) => (job._id ? job._id : `${job.name}-${idx}`)}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item: job }) => (
                  <JobTransactionList job={job} year={selectedYear} />
                )}
              />

              <Button mode="contained" onPress={() => setSelectedClient(null)} style={{ marginTop: 15 }}>
                Close
              </Button>
            </View>
          </View>
        </Modal>
      )}

      {/* Year Picker Modal */}
      {showYearPicker && (
        <Modal transparent visible animationType="fade">
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          >
            {/* Backdrop */}
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => setShowYearPicker(false)}
            />

            {/* Modal content */}
            <View
              style={{
                width: '80%',
                maxHeight: '60%',
                backgroundColor: 'white',
                borderRadius: 10,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  marginBottom: 15,
                  textAlign: 'center',
                }}
              >
                Select Year
              </Text>

              <FlatList
                data={availableYears}
                keyExtractor={(item) => item.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedYear(item);
                      setShowYearPicker(false);
                    }}
                    style={{
                      padding: 15,
                      borderBottomWidth: 1,
                      borderBottomColor: '#eee',
                      backgroundColor: selectedYear === item ? '#f0f0f0' : 'white',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        textAlign: 'center',
                        fontWeight: selectedYear === item ? 'bold' : 'normal',
                        color: selectedYear === item ? config.app.theme.purple : 'black',
                      }}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />

              <Button mode="outlined" onPress={() => setShowYearPicker(false)} style={{ marginTop: 15 }}>
                Cancel
              </Button>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

export default Clients;
