import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, ScrollView, Alert, Modal, TouchableOpacity, TouchableWithoutFeedback, Keyboard, Platform, KeyboardAvoidingView
} from 'react-native';
import config from '../config.json';
import { Card, Button, Divider, Menu, Provider, Checkbox } from 'react-native-paper';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import BouncyCheckbox from "react-native-bouncy-checkbox";
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = config.app.api;

const Jobs = ({ userId, state, isNewUser, rates }) => {

    if (isNewUser) {
        return null;
    }
    const [jobs, setJobs] = useState([]);
    const [filteredJobs, setFilteredJobs] = useState([]);
    const [newJobName, setNewJobName] = useState('');
    const [newClient, setNewClient] = useState('');
    const [selectedJob, setSelectedJob] = useState(null);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [isNegative, setIsNegative] = useState(false);
    const [isTaxExempt, setIsTaxExempt] = useState(false);
    const [isPaid, setIsPaid] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [summaryMode, setSummaryMode] = useState('total'); // 'q1', 'q2', 'q3', 'q4', 'total'
    const [availableYears, setAvailableYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState('All Time');
const [showYearPicker, setShowYearPicker] = useState(false);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isJob, setIsJob] = useState(false); // Are we deleting a job or a transaction
    const [totalTax, setTotalTax] = useState({ federal: 0, state: 0 });
    const [totalIncome, setTotalIncome] = useState(0);
    const [totalExpenses, setTotalExpenses] = useState(0);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const swipeableRefs = useRef({});

    // Year should default to "All Time" if not provided
    const displayYear = selectedYear || 'All Time';

    useEffect(() => {
        fetchJobs();
    }, [userId]);

    // Filter jobs whenever the jobs array or year changes
    useEffect(() => {
        filterJobsByYear();
    }, [jobs, displayYear]);

    // Generate available years based on transaction data
    useEffect(() => {
        if (jobs.length > 0) {
            const years = new Set();
            const currentYear = new Date().getFullYear();

            // Add current year
            years.add(currentYear);

            // Add years from transaction history
            jobs.forEach(job => {
                job.transactions.forEach(tx => {
                    const txYear = new Date(tx.date).getFullYear();
                    years.add(txYear);
                });
            });

            // Sort years in descending order
            const sortedYears = Array.from(years).sort((a, b) => b - a);
            // Add "All Time" option at the beginning
            setAvailableYears(['All Time', ...sortedYears]);
        }
    }, [jobs]);

    useEffect(() => {
        const { income, expenses } = calculateTotals(summaryMode);
        setTotalIncome(income);
        setTotalExpenses(expenses);
        setTotalRevenue(income - expenses);

        // Get the period bounds
        const { start, end } = getQuarterBounds(summaryMode);

        // Track total net taxable income across all jobs for the selected period
        let totalPeriodNetTaxableIncome = 0;

        // First pass: calculate period-specific net taxable income for each job
        const jobTaxableIncomes = filteredJobs.map(job => {
            // Calculate period-specific net taxable income
            const periodIncome = job.transactions
                .filter(tx => {
                    const txDate = new Date(tx.date);
                    return tx.type === 'income' && !tx.taxExempt &&
                           txDate >= start && txDate <= end;
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            const periodExpenses = job.transactions
                .filter(tx => {
                    const txDate = new Date(tx.date);
                    return tx.type === 'expense' &&
                           txDate >= start && txDate <= end;
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            const periodNetTaxableIncome = periodIncome - periodExpenses;

            // Add to total period net taxable income
            totalPeriodNetTaxableIncome += periodNetTaxableIncome;

            return {
                job,
                periodNetTaxableIncome,
                periodIncome,
                periodExpenses
            };
        });

        // Initialize tax amounts
        let fedTaxSum = 0;
        let stateTaxSum = 0;

        // Calculate taxes for the current period
        jobTaxableIncomes.forEach(({ job, periodNetTaxableIncome, periodIncome, periodExpenses }) => {
            // Recalculate taxes for this specific period
            if (periodNetTaxableIncome !== 0) {
                const periodTaxes = calculateTaxes(periodIncome, periodExpenses, state);

                // Sum up taxes
                fedTaxSum += periodTaxes.federal;
                stateTaxSum += periodTaxes.state;
            }
        });

        // Set the calculated taxes for the current period
        setTotalTax({
            federal: fedTaxSum,
            state: stateTaxSum
        });
    }, [filteredJobs, summaryMode]);

    function fetchJobs() {
        fetch(`${API_URL}/jobs?userId=${userId}`)
            .then(res => res.json())
            .then(data => {
                // Initialize tax calculation for jobs without tax data
                const jobsWithTaxes = data.map(job => {
                    if (!job.tax) {
                        return calculateJobTax(job, state);
                    }
                    return job;
                });

                // First set the jobs with any existing tax data
                setJobs(data);

                // Then update tax calculations for all jobs
                Promise.all(jobsWithTaxes).then(updatedJobs => {
                    setJobs(updatedJobs);
                });
            })
            .catch(err => console.error('Failed to fetch jobs', err));
    }


    // Local function to calculate tax
    // need to provide rates object from login
    const calculateTaxes = (income, expenses, stateCode) => {
        const netIncome = income - expenses;

        // Self-employment tax (15.3%) and 50% deductible (federal only)
        const selfEmploymentTax = netIncome * rates.selfEmploymentTaxRate;
        const deductibleSelfEmploymentTax = selfEmploymentTax * rates.selfEmploymentTaxDeductionRate;

        // QBI deduction (20% of qualified business income)
        const qbiDeduction = Math.max(0, netIncome * rates.qbiDeductionRate);

        // Calculate federal taxable income with standard and QBI deductions
        const federalTaxableIncome = Math.max(0, netIncome - rates.standardDeduction - qbiDeduction - deductibleSelfEmploymentTax);

        // Federal taxes include income tax and self-employment tax
        const federalIncomeTax = calculateFederalTax(federalTaxableIncome);
        const totalFederalTax = federalIncomeTax + selfEmploymentTax;

        // State taxes (self-employment tax does not apply to state)
        const stateTaxRate = rates.stateTaxRates[stateCode.toUpperCase()] || 0;
        const stateTaxableIncome = Math.max(0, netIncome - rates.standardDeduction - qbiDeduction);
        const stateTax = stateTaxableIncome * stateTaxRate;

        return {
            federal: totalFederalTax,
            state: stateTax
        };
    };

    // Instead we do this locally now, and provide the user with rates object
const calculateFederalTax = (taxableIncome) => {
    let federalTax = 0;
    let remainingIncome = taxableIncome;

    for (let i = rates.federalTaxBrackets.length - 1; i >= 0; i--) {
        const { rate, income } = rates.federalTaxBrackets[i];
        if (remainingIncome > income) {
            federalTax += (remainingIncome - income) * rate;
            remainingIncome = income;
        }
    }

    return federalTax;
};

    async function calculateJobTax(job, stateCode) {
        // Get taxable income (exclude tax exempt transactions)
        const taxableIncome = job.transactions
            .filter(tx => tx.type === 'income' && !tx.taxExempt)
            .reduce((sum, tx) => sum + tx.amount, 0);

        const expenses = job.transactions
            .filter(tx => tx.type === 'expense')
            .reduce((sum, tx) => sum + tx.amount, 0);

            const taxData = calculateTaxes(taxableIncome, expenses, stateCode)

            // Add tax data to job object
            const updatedJob = {
                ...job,
                tax: taxData
            };

            // Update the job in the database with tax information
            fetch(`${API_URL}/jobs/${job._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tax: taxData })
            });

            return updatedJob;

        try {
            const response = await fetch(`${API_URL}/calculate-tax`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    income: taxableIncome,
                    expenses: expenses,
                    stateCode: stateCode
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const taxData = await response.json();

            // Add tax data to job object
            const updatedJob = {
                ...job,
                tax: taxData
            };

            // Update the job in the database with tax information
            await fetch(`${API_URL}/jobs/${job._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tax: taxData })
            });

            return updatedJob;
        } catch (err) {
            console.error('Failed to calculate taxes for job', job.name, err);
            return {
                ...job,
                tax: { federal: 0, state: 0 }
            };
        }
    }

    // Filter jobs and their transactions by year
    function filterJobsByYear() {
        if (displayYear === 'All Time') {
            // Show all transactions
            setFilteredJobs(jobs);
            return;
        }

        const startOfYear = new Date(displayYear, 0, 1);
        const endOfYear = new Date(displayYear, 11, 31, 23, 59, 59);

        const filtered = jobs.map(job => {
            // Filter transactions for the specified year
            const yearTransactions = job.transactions.filter(tx => {
                const txDate = new Date(tx.date);
                return txDate >= startOfYear && txDate <= endOfYear;
            });

            // Return a new job object with filtered transactions
            return {
                ...job,
                transactions: yearTransactions
            };
        });

        setFilteredJobs(filtered);
    }

    // Helper function to get the most recent transaction date for a job
    const getMostRecentTransactionDate = (job) => {
        if (!job.transactions || job.transactions.length === 0) {
            return new Date(0); // Return epoch time for jobs with no transactions
        }
        const dates = job.transactions.map(tx => new Date(tx.date));
        return new Date(Math.max(...dates));
    };

    // Sort filtered jobs: "General" first, then by most recent transaction date
    const getSortedJobs = () => {
        const generalJobs = filteredJobs.filter(job => job.name === 'General');
        const otherJobs = filteredJobs.filter(job => job.name !== 'General');

        // Sort other jobs by most recent transaction date (descending)
        otherJobs.sort((a, b) => {
            const dateA = getMostRecentTransactionDate(a);
            const dateB = getMostRecentTransactionDate(b);
            return dateB - dateA; // Most recent first
        });

        return [...generalJobs, ...otherJobs];
    };

    const formatDate = (date) => {
        const d = new Date(date);
        return `${(d.getMonth() + 1)}/${d.getDate().toString().padStart(2, '0')}`;
    };

    const formatFullDate = (date) => {
        const d = new Date(date);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    };

    const onDateChange = (event, selectedDate) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (selectedDate) {
            setSelectedDate(selectedDate);
        }
    };

    const addJob = () => {
        if (!newJobName) return;
        fetch(`${API_URL}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newJobName,
                client: newClient,
                userId,
                transactions: [],
                tax: { federal: 0, state: 0 }
            }),
        })
            .then(() => {
                setNewJobName('');
                setNewClient('');
                fetchJobs();
                setShowModal(false);
            })
            .catch(err => {
                Alert.alert('Error', 'Failed to add job');
                console.log(err);
            });
    };

    const handleSwipeRelease = (type, jobId, swipeableKey) => {
        setModalType(type);
        setSelectedJob(jobs.find(job => job._id === jobId));
        setShowModal(true);
        setAmount('');
        setNote('');
        setIsTaxExempt(false);
        setIsPaid(false);
        setSelectedDate(new Date());
        setShowDatePicker(false);
        if (swipeableRefs.current[swipeableKey]) {
            swipeableRefs.current[swipeableKey].close();
        }
    };

    const handleJobPress = (job) => {
        // Use the non-filtered job for editing to include all transactions
        const originalJob = jobs.find(j => j._id === job._id);
        setSelectedJob(originalJob);
        setModalType('editJob');
        setShowModal(true);
    };

    const handleTransactionPress = (transaction, job) => {
        setSelectedJob(job);
        setSelectedTransaction(transaction);
        setAmount(Math.abs(transaction.amount).toString());
        setNote(transaction.note || '');
        setIsNegative(transaction.amount < 0);
        setIsTaxExempt(transaction.taxExempt || false);
        setSelectedDate(new Date(transaction.date));
        setModalType('editTransaction');
        setShowModal(true);
        setShowDatePicker(false);
    };

    const handleConfirm = async () => {
        // Make sure amount is properly parsed as a float
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            Alert.alert('Error', 'Please enter a valid number');
            return;
        }

        // Create transaction with taxExempt using ternary to match update logic exactly
        const transaction = {
            type: modalType,
            amount: parsedAmount * (isNegative ? -1 : 1),
            note: note || '',
            date: selectedDate.toISOString(),
            taxExempt: modalType === 'income' ? isTaxExempt : false
        };

        // Hide modal immediately before API call
        setShowModal(false);

        try {
            // Add transaction to job
            const response = await fetch(`${API_URL}/jobs/transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: selectedJob._id,
                    transaction
                }),
            });

            // Check if the response is OK and contains valid JSON
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response:', errorText);
                throw new Error(`Failed to add transaction. Status: ${response.status}`);
            }

            const responseData = await response.json();

            // If this is an expense and isPaid is checked, also add an income transaction
            if (modalType === 'expense' && isPaid) {
                const incomeTransaction = {
                    type: 'income',
                    amount: parsedAmount * (isNegative ? -1 : 1),
                    note: (note || '') + ' (paid)',
                    date: selectedDate.toISOString(),
                    taxExempt: false
                };

                const incomeResponse = await fetch(`${API_URL}/jobs/transaction`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jobId: selectedJob._id,
                        transaction: incomeTransaction
                    }),
                });

                if (!incomeResponse.ok) {
                    const errorText = await incomeResponse.text();
                    console.error('Server response when adding income:', errorText);
                    throw new Error(`Failed to add income transaction. Status: ${incomeResponse.status}`);
                }
            }

            // Get updated job
            const updatedJobResponse = await fetch(`${API_URL}/jobs/${selectedJob._id}`);

            if (!updatedJobResponse.ok) {
                const errorText = await updatedJobResponse.text();
                console.error('Server response when fetching updated job:', errorText);
                throw new Error(`Failed to fetch updated job. Status: ${updatedJobResponse.status}`);
            }

            const updatedJob = await updatedJobResponse.json();

            // Recalculate taxes for this job
            const jobWithTax = await calculateJobTax(updatedJob, state);

            // Update jobs array with the updated job including tax data
            setJobs(prevJobs => prevJobs.map(job =>
                job._id === jobWithTax._id ? jobWithTax : job
            ));

            setAmount('');
            setNote('');
            setIsTaxExempt(false);
            setIsPaid(false);
            setIsNegative(false);
        } catch (err) {
            Alert.alert('Error', `Failed to add transaction: ${err.message}`);
            console.error('Error adding transaction:', err);
        }
    };

    const handleUpdateTransaction = async () => {
        // Make sure amount is properly parsed as a float
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            Alert.alert('Error', 'Please enter a valid number');
            return;
        }

        // Create updated transaction object
        const updatedTransaction = {
            ...selectedTransaction,
            amount: Math.abs(parsedAmount) * (isNegative ? -1 : 1),
            note: note || '',
            date: selectedDate.toISOString(),
            taxExempt: selectedTransaction.type === 'income' ? isTaxExempt : false
        };

        // Find the transaction index in the job's transactions array
        const transactionIndex = selectedJob.transactions.findIndex(
            tx => tx.date === selectedTransaction.date &&
                 tx.amount === selectedTransaction.amount &&
                 tx.type === selectedTransaction.type
        );

        if (transactionIndex === -1) {
            Alert.alert('Error', 'Transaction not found');
            return;
        }

        // Create a copy of the job's transactions
        const updatedTransactions = [...selectedJob.transactions];
        // Replace the transaction at the found index
        updatedTransactions[transactionIndex] = updatedTransaction;

        // Hide modal immediately
        setShowModal(false);
        setSelectedTransaction(null);
        setIsTaxExempt(false);
        setIsNegative(false);

        try {
            // Update job with modified transaction
            const response = await fetch(`${API_URL}/jobs/${selectedJob._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactions: updatedTransactions
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response:', errorText);
                throw new Error(`Failed to update transaction. Status: ${response.status}`);
            }

            // Get updated job
            const updatedJobResponse = await fetch(`${API_URL}/jobs/${selectedJob._id}`);

            if (!updatedJobResponse.ok) {
                const errorText = await updatedJobResponse.text();
                console.error('Server response when fetching updated job:', errorText);
                throw new Error(`Failed to fetch updated job. Status: ${updatedJobResponse.status}`);
            }

            const updatedJob = await updatedJobResponse.json();

            // Recalculate taxes for this job
            const jobWithTax = await calculateJobTax(updatedJob, state);

            // Update jobs array with the updated job including tax data
            setJobs(prevJobs => prevJobs.map(job =>
                job._id === jobWithTax._id ? jobWithTax : job
            ));
        } catch (err) {
            Alert.alert('Error', `Failed to update transaction: ${err.message}`);
            console.error('Error updating transaction:', err);
        }
    };

    const handleDeleteTransaction = async () => {
        // Find the transaction index in the job's transactions array
        const transactionIndex = selectedJob.transactions.findIndex(
            tx => tx.date === selectedTransaction.date &&
                 tx.amount === selectedTransaction.amount &&
                 tx.type === selectedTransaction.type
        );

        if (transactionIndex === -1) {
            Alert.alert('Error', 'Transaction not found');
            return;
        }

        // Create a copy of the job's transactions without the deleted transaction
        const updatedTransactions = selectedJob.transactions.filter((_, index) => index !== transactionIndex);

        try {
            // Update job with modified transactions
            const response = await fetch(`${API_URL}/jobs/${selectedJob._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...selectedJob,
                    transactions: updatedTransactions
                })
            });

            if (!response.ok) {
                throw new Error('Failed to delete transaction');
            }

            // Get updated job
            const updatedJobResponse = await fetch(`${API_URL}/jobs/${selectedJob._id}`);
            const updatedJob = await updatedJobResponse.json();

            // Recalculate taxes for this job
            const jobWithTax = await calculateJobTax(updatedJob, state);

            // Update jobs array with the updated job including tax data
            setJobs(prevJobs => prevJobs.map(job =>
                job._id === jobWithTax._id ? jobWithTax : job
            ));

            setShowModal(false);
            setShowDeleteConfirm(false);
            setSelectedTransaction(null);
        } catch (err) {
            Alert.alert('Error', 'Failed to delete transaction');
            console.error(err);
        }
    };

    const handleUpdateJob = async () => {
        try {
            const response = await fetch(`${API_URL}/jobs/${selectedJob._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: selectedJob.name, client: selectedJob.client })
            });

            if (!response.ok) {
                throw new Error('Failed to update job');
            }

            fetchJobs();
            setShowModal(false);
        } catch (err) {
            Alert.alert('Error', 'Failed to update job');
            console.error(err);
        }
    };

    const handleDeleteJob = () => {
        fetch(`${API_URL}/jobs/${selectedJob._id}`, { method: 'DELETE' })
            .then(fetchJobs)
            .then(() => setShowModal(false))
            .catch(() => Alert.alert('Error', 'Failed to delete job'));
    };

    const getQuarterBounds = (quarter) => {
        // For "All Time", return a very wide date range
        if (displayYear === 'All Time') {
            return {
                start: new Date(1970, 0, 1),
                end: new Date(2100, 11, 31, 23, 59, 59)
            };
        }

        switch (quarter) {
            case 'q1':
                return {
                    start: new Date(displayYear, 0, 1),  // Jan 1
                    end: new Date(displayYear, 2, 31, 23, 59, 59)  // March 31
                };
            case 'q2':
                return {
                    start: new Date(displayYear, 3, 1),  // April 1
                    end: new Date(displayYear, 4, 31, 23, 59, 59)  // May 31
                };
            case 'q3':
                return {
                    start: new Date(displayYear, 5, 1),  // June 1
                    end: new Date(displayYear, 7, 31, 23, 59, 59)  // Aug 31
                };
            case 'q4':
                return {
                    start: new Date(displayYear, 8, 1),  // Sept 1
                    end: new Date(displayYear, 11, 31, 23, 59, 59)  // Dec 31
                };
            default:
                return {
                    start: new Date(displayYear, 0, 1),  // Jan 1
                    end: new Date(displayYear, 11, 31, 23, 59, 59)  // Dec 31
                };
        }
    };

    const calculateTotals = (mode) => {
        const { start, end } = getQuarterBounds(mode);

        return filteredJobs.reduce((totals, job) => {
            job.transactions.forEach(tx => {
                const txDate = new Date(tx.date);
                // Check if transaction date is within the selected quarter/period bounds
                if (txDate >= start && txDate <= end) {
                    if (tx.type === 'income' && !tx.taxExempt) {
                        totals.income += tx.amount;
                    } else if (tx.type === 'expense') {
                        totals.expenses += tx.amount;
                    }
                }
            });
            return totals;
        }, { income: 0, expenses: 0 });
    };
    const cycleSummaryMode = () => {
        const modes = ['total', 'q1', 'q2', 'q3', 'q4'];
        const currentIndex = modes.indexOf(summaryMode);
        setSummaryMode(modes[(currentIndex + 1) % modes.length]);
    };

    const handleAddTransactionFromJobModal = (transactionType) => {
        // Close the current job modal
        setShowModal(false);

        // Open a new transaction modal with the selected type
        setTimeout(() => {
            setModalType(transactionType);
            setShowModal(true);
            setAmount('');
            setNote('');
            setIsTaxExempt(false);
            setIsPaid(false);
            setSelectedDate(new Date());
            setShowDatePicker(false);
        }, 300);
    };

    const TransactionList = ({ transactions, type, job }) => (
        <View style={{ flex: 1, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: type === 'income' ? '#6750a4' : 'black', marginLeft: 10 }}>
                    {type === 'income' ? 'Income' : 'Expenses'}
                </Text>
                <TouchableOpacity
                    onPress={() => handleAddTransactionFromJobModal(type)}
                    style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: config.app.theme.purple,
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 10
                    }}
                >
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>+</Text>
                </TouchableOpacity>
            </View>
            {/* Fixed: Made the ScrollView properly scrollable with a fixed height */}
            <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps='handled'
                style={{ height: 200,  borderRadius: 5 }}
            >
                {transactions
                    .filter(tx => {
                        if (displayYear === 'All Time') return tx.type === type;
                        const txDate = new Date(tx.date);
                        return tx.type === type &&
                               txDate.getFullYear() === displayYear;
                    })
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((tx, index) => (
                        <TouchableOpacity
                            key={index}
                            onPress={() => handleTransactionPress(tx, job)}
                        >
                            <Card style={{ margin: 3, padding: 10, backgroundColor: '#f8f8f8' }}>
                                <View style={{ flex: 1}}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 14 }}>{formatDate(tx.date)}</Text>

                                        <Text style={{
                                            fontSize: 14,
                                            color: '#6750a4'
                                        }}>
                                            {tx.amount < 0 ? '-' : ''}${Math.abs(tx.amount).toFixed(2)}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 12, color: '#666' }}>{tx.note}</Text>
                                        {tx.type === 'income' && tx.taxExempt && (
                                            <Text style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>Exempt</Text>
                                        )}
                                    </View>
                                </View>
                            </Card>
                        </TouchableOpacity>
                    ))}
            </ScrollView>
        </View>
    );

    // Delete Transaction Confirmation Modal
    const DeleteConfirmationModal = () => (
        <Modal transparent visible={showDeleteConfirm} animationType="fade">
            <TouchableWithoutFeedback onPress={() => setShowDeleteConfirm(false)}>
                <View style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)'
                }}>
                    <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View style={{
                            padding: 20,
                            width: '80%',
                            borderRadius: 10,
                            backgroundColor: 'white',
                            elevation: 5
                        }}>
                            <Text style={{ fontSize: 18, marginBottom: 15, textAlign: 'center' }}>
                                Delete {isJob? 'Job': 'Transaction'}?
                            </Text>
                            <Text style={{ marginBottom: 20, textAlign: 'center' }}>
                                This action cannot be undone.
                            </Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Button
                                    mode="contained"
                                    onPress={(e) => {e.preventDefault(); setShowDeleteConfirm(false); isJob? handleDeleteJob() : handleDeleteTransaction()}}
                                    style={{ flex: 1, marginLeft: 5 }}
                                    color="red"
                                >
                                    Delete
                                </Button>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );

    return (
        <Provider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && <DeleteConfirmationModal />}

                <View style={{ padding: 10, backgroundColor: '#f0f0f0', alignItems: 'center' }}>
    <Button
        mode="outlined"
        onPress={() => setShowYearPicker(true)}
        style={{ marginBottom: 5 }}
    >
        {displayYear} Financial Overview
    </Button>
</View>

{/* Year Picker Modal */}
{showYearPicker && (
    <Modal transparent visible animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowYearPicker(false)}>
            <View style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)'
            }}>
                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                    <View style={{
                        padding: 20,
                        width: '80%',
                        maxHeight: '60%',
                        borderRadius: 10,
                        backgroundColor: 'white',
                        elevation: 5
                    }}>
                        <Text style={{
                            fontSize: 18,
                            fontWeight: 'bold',
                            marginBottom: 15,
                            textAlign: 'center'
                        }}>
                            Select Year
                        </Text>
                        <ScrollView>
                            {availableYears.map(year => (
                                <TouchableOpacity
                                    key={year}
                                    onPress={() => {
                                        setSelectedYear(year);
                                        setShowYearPicker(false);
                                    }}
                                    style={{
                                        padding: 15,
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#eee',
                                        backgroundColor: year === displayYear ? '#f0f0f0' : 'white'
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 16,
                                        textAlign: 'center',
                                        fontWeight: year === displayYear ? 'bold' : 'normal',
                                        color: year === displayYear ? config.app.theme.purple : 'black'
                                    }}>
                                        {year}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </TouchableWithoutFeedback>
    </Modal>
)}

                <ScrollView keyboardShouldPersistTaps='handled'>
                    {getSortedJobs().map((item, index) => (
                        <View key={item._id}>
                            <Swipeable
                                ref={ref => swipeableRefs.current[item._id] = ref}
                                renderLeftActions={() => (
                                    <View style={{
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        width: 80,
                                        margin: 10,
                                        borderRadius: 10,
                                        padding: 3,
                                        backgroundColor: config.app.theme.purple
                                    }}>
                                        <Text style={{ color: 'white' }}>Income</Text>
                                    </View>
                                )}
                                renderRightActions={() => (
                                    <View style={{
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        width: 80,
                                        margin: 10,
                                        borderRadius: 10,
                                        padding: 3,
                                        backgroundColor: config.app.theme.purple
                                    }}>
                                        <Text style={{ color: 'white' }}>Expense</Text>
                                    </View>
                                )}
                                onSwipeableOpen={(direction) =>
                                    handleSwipeRelease(direction !== 'right' ? 'income' : 'expense', item._id, item._id)
                                }
                            >
                                <Card style={{ margin: 10, padding: 15 }} onPress={() => handleJobPress(item)}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{item.name}</Text>
            <Text>{item.client}</Text>
            <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                Tax: ${(() => {
                    // Calculate tax only for the filtered year's transactions
                    const yearIncome = item.transactions
                        .filter(tx => tx.type === 'income' && !tx.taxExempt)
                        .reduce((sum, tx) => sum + tx.amount, 0);
                    const yearExpenses = item.transactions
                        .filter(tx => tx.type === 'expense')
                        .reduce((sum, tx) => sum + tx.amount, 0);

                    if (yearIncome === 0 && yearExpenses === 0) {
                        return '0.00';
                    }

                    const yearTax = calculateTaxes(yearIncome, yearExpenses, state);
                    return ((yearTax?.federal || 0) + (yearTax?.state || 0)).toFixed(2);
                })()}
            </Text>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
            <Text style={{ color: 'black' }}>
                ${item.transactions
                    .filter(tx => tx.type === 'income')
                    .reduce((sum, tx) => sum + (tx.amount), 0)
                    .toFixed(2)}
            </Text>
            <Text style={{ color: 'gray' }}>
                ${item.transactions
                    .filter(tx => tx.type === 'expense')
                    .reduce((sum, tx) => sum + (tx.amount), 0)
                    .toFixed(2)}
            </Text>
            <Text style={{ color: '#6750a4' }}>
                ${(
                    item.transactions
                        .filter(tx => tx.type === 'income')
                        .reduce((sum, tx) => sum + (tx.amount), 0) -
                    item.transactions
                        .filter(tx => tx.type === 'expense')
                        .reduce((sum, tx) => sum + (tx.amount), 0)
                ).toFixed(2)}
            </Text>
            <Text style={{ color: '#6750a4', fontSize: 12 }}>
                Adj: ${(() => {
                    const income = item.transactions
                        .filter(tx => tx.type === 'income')
                        .reduce((sum, tx) => sum + (tx.amount), 0);
                    const expenses = item.transactions
                        .filter(tx => tx.type === 'expense')
                        .reduce((sum, tx) => sum + (tx.amount), 0);
                    const revenue = income - expenses;

                    // Calculate tax only for filtered year
                    const yearIncome = item.transactions
                        .filter(tx => tx.type === 'income' && !tx.taxExempt)
                        .reduce((sum, tx) => sum + tx.amount, 0);
                    const yearExpenses = item.transactions
                        .filter(tx => tx.type === 'expense')
                        .reduce((sum, tx) => sum + tx.amount, 0);

                    let yearTaxTotal = 0;
                    if (yearIncome !== 0 || yearExpenses !== 0) {
                        const yearTax = calculateTaxes(yearIncome, yearExpenses, state);
                        yearTaxTotal = (yearTax?.federal || 0) + (yearTax?.state || 0);
                    }

                    return (revenue - yearTaxTotal).toFixed(2);
                })()}
            </Text>
        </View>
    </View>
</Card>
                            </Swipeable>
                            {item.name === 'General' && index === 0 && (
                                <View style={{
                                    height: 1,
                                    backgroundColor: '#ddd',
                                    marginHorizontal: 20,
                                    marginVertical: 5
                                }} />
                            )}
                        </View>
                    ))}

                    {showModal && (
                        <Modal transparent visible animationType="fade">
                            <KeyboardAvoidingView
                                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                style={{ flex: 1 }}
                            >
                                <TouchableWithoutFeedback onPress={() => setShowModal(false)}>
                                    <View style={{
                                        flex: 1,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        backgroundColor: 'rgba(0,0,0,0.5)'
                                    }}>
                                        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                                            <View style={{
                                                width: '90%',
                                                maxHeight: '80%',
                                                borderRadius: 10,
                                                backgroundColor: 'white',
                                                shadowColor: "#000",
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: 0.25,
                                                shadowRadius: 3.84,
                                                elevation: 5,
                                                overflow: 'hidden'
                                            }}>
                                                <ScrollView
                                                    contentContainerStyle={{ padding: 20 }}
                                                    keyboardShouldPersistTaps='handled'
                                                    showsVerticalScrollIndicator={true}
                                                >
                                            {modalType === 'addJob' ? (
                                                <>
                                                    <TextInput
                                                        placeholder="Job Name"
                                                        value={newJobName}
                                                        onChangeText={setNewJobName}
                                                        style={{ marginBottom: 10 }}
                                                        autoFocus
                                                    />
                                                    <TextInput
                                                        placeholder="Client"
                                                        value={newClient}
                                                        onChangeText={setNewClient}
                                                        style={{ marginBottom: 20 }}
                                                    />
                                                    <Button mode="contained" disabled={!newJobName} onPress={addJob}>
                                                        Add Job
                                                    </Button>
                                                </>
                                            ) : modalType === 'editJob' ? (
                                                <ScrollView
                                                    keyboardShouldPersistTaps='handled'
                                                    nestedScrollEnabled
                                                >
                                                    <TextInput
                                                        placeholder="Job Name"
                                                        value={selectedJob.name}
                                                        onChangeText={(name) => setSelectedJob({ ...selectedJob, name })}
                                                        style={{ marginBottom: 10 }}
                                                    />
                                                    <TextInput
                                                        placeholder="Client"
                                                        value={selectedJob.client}
                                                        onChangeText={(client) => setSelectedJob({ ...selectedJob, client })}
                                                        style={{ marginBottom: 20 }}
                                                    />
                                                    <Button mode="contained" onPress={handleUpdateJob} style={{ marginBottom: 10 }}>
                                                        Update Job
                                                    </Button>
                                                    <Button mode="outlined" onPress={() => {setShowModal(false); setShowDeleteConfirm(true) ;setIsJob(true)}} color="red" style={{ marginBottom: 20 }}>
                                                        Delete Job
                                                    </Button>

                                                    <Divider style={{ marginVertical: 10 }} />

                                                    <View style={{ flexDirection: 'row' }}>
                                                        <View style={{ flex: 1, marginRight: 5 }}>
                                                            <TransactionList
                                                                transactions={selectedJob.transactions}
                                                                type="expense"
                                                                job={selectedJob}
                                                            />
                                                        </View>
                                                        <View style={{ flex: 1, marginLeft: 5 }}>
                                                            <TransactionList
                                                                transactions={selectedJob.transactions}
                                                                type="income"
                                                                job={selectedJob}
                                                            />
                                                        </View>
                                                    </View>
                                                </ScrollView>
                                            ) : modalType === 'editTransaction' ? (
                                                <>
                                                    <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>
                                                        Edit Transaction
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                                                        <TouchableOpacity onPress={() => setIsNegative(!isNegative)}>
                                                            <Text style={{
                                                                fontSize: 24,
                                                                marginRight: 10,
                                                                color: isNegative ? 'red' : 'green',
                                                                textAlign: "center"
                                                            }}>
                                                                {isNegative ? '−' : '+'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        <TextInput
                                                            placeholder="Amount"
                                                            value={amount}
                                                            onChangeText={setAmount}
                                                            keyboardType="numeric"
                                                            returnKeyType="done"
                                                            onSubmitEditing={handleUpdateTransaction}
                                                            style={{ flex: 1, marginBottom: 10 }}
                                                            autoFocus
                                                        />
                                                    </View>

                                                    

                                                    <TextInput
                                                        placeholder="Add a note (optional)"
                                                        value={note}
                                                        onChangeText={setNote}
                                                        style={{ marginBottom: 15 }}
                                                        multiline
                                                    />
                                                    
                                                    {selectedTransaction && selectedTransaction.type === 'income' && (
                                                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 15 }}>
                                                            <BouncyCheckbox
                                                                isChecked={isTaxExempt}
                                                                onPress={() => setIsTaxExempt(!isTaxExempt)}
                                                                fillColor={config.app.theme.purple}
                                                                unfillColor="#fff"
                                                                text="Tax Exempt"
                                                                textStyle={{ textDecorationLine: "none", marginLeft: 8 }}
                                                            />
                                                        </View>
                                                    )}
                                                    {selectedTransaction && selectedTransaction.type === 'expense' && (
                                                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 15 }}>
                                                            <BouncyCheckbox
                                                                isChecked={isPaid}
                                                                onPress={() => setIsPaid(!isPaid)}
                                                                fillColor={config.app.theme.purple}
                                                                unfillColor="#fff"
                                                                text="Paid"
                                                                textStyle={{ textDecorationLine: "none", marginLeft: 8 }}
                                                            />
                                                        </View>
                                                    )}

                                                    <TouchableOpacity
                                                        onPress={() => setShowDatePicker(!showDatePicker)}
                                                        style={{
                                                            padding: 12,
                                                            borderWidth: 1,
                                                            borderColor: config.app.theme.purple,
                                                            borderRadius: 5,
                                                            marginBottom: 15,
                                                            backgroundColor: '#f9f9f9'
                                                        }}
                                                    >
                                                        <Text style={{ fontSize: 14, color: '#333' }}>
                                                            Date: {formatFullDate(selectedDate)}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    {showDatePicker && Platform.OS === 'ios' && (
                                                        <View style={{
                                                            backgroundColor: '#fff',
                                                            borderRadius: 10,
                                                            marginBottom: 15,
                                                            overflow: 'hidden'
                                                        }}>
                                                            <DateTimePicker
                                                                value={selectedDate}
                                                                mode="date"
                                                                display="inline"
                                                                onChange={onDateChange}
                                                                maximumDate={new Date()}
                                                                style={{ height: 350 }}
                                                            />
                                                        </View>
                                                    )}

                                                    {showDatePicker && Platform.OS === 'android' && (
                                                        <DateTimePicker
                                                            value={selectedDate}
                                                            mode="date"
                                                            display="default"
                                                            onChange={onDateChange}
                                                            maximumDate={new Date()}
                                                        />
                                                    )}



                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Button
                                                            mode="outlined"
                                                            textColor="red"
                                                            onPress={() => {setShowModal(false); setShowDeleteConfirm(true); setIsJob(false)}}
                                                            style={{ flex: 1, marginRight: 5 }}
                                                        >
                                                            Delete
                                                        </Button>
                                                        <Button
                                                            mode="contained"
                                                            onPress={handleUpdateTransaction}
                                                            disabled={!amount || isNaN(parseFloat(amount))}
                                                            style={{ flex: 1, marginLeft: 5 }}
                                                        >
                                                            Save
                                                        </Button>
                                                    </View>
                                                </>
                                            ) : (
                                                <>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                                                        <TouchableOpacity onPress={() => setIsNegative(!isNegative)}>
                                                            <Text style={{
                                                                fontSize: 24,
                                                                marginRight: 10,
                                                                color: isNegative ? 'red' : 'green',
                                                                textAlign: "center"
                                                            }}>
                                                                {isNegative ? '−' : '+'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        <TextInput
                                                            placeholder="Amount"
                                                            value={amount}
                                                            onChangeText={setAmount}
                                                            keyboardType="numeric"
                                                            returnKeyType="done"
                                                            onSubmitEditing={handleConfirm}
                                                            style={{ flex: 1, marginBottom: 10 }}
                                                            autoFocus
                                                        />
                                                    </View>
                                                    <TextInput
                                                        placeholder="Add a note (optional)"
                                                        value={note}
                                                        onChangeText={setNote}
                                                        style={{ marginBottom: 15 }}
                                                        multiline
                                                    />

                                                    {modalType === 'income' && (
                                                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 15 }}>
                                                            <BouncyCheckbox
                                                                isChecked={isTaxExempt}
                                                                onPress={() => setIsTaxExempt(!isTaxExempt)}
                                                                fillColor={config.app.theme.purple}
                                                                unfillColor="#fff"
                                                                text="Tax Exempt"
                                                                textStyle={{ textDecorationLine: "none", marginLeft: 8 }}
                                                            />
                                                        </View>
                                                    )}
                                                    {modalType === 'expense' && (
                                                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 15 }}>
                                                            <BouncyCheckbox
                                                                isChecked={isPaid}
                                                                onPress={() => setIsPaid(!isPaid)}
                                                                fillColor={config.app.theme.purple}
                                                                unfillColor="#fff"
                                                                text="Paid"
                                                                textStyle={{ textDecorationLine: "none", marginLeft: 8 }}
                                                            />
                                                        </View>
                                                    )}

                                                    <TouchableOpacity
                                                        onPress={() => setShowDatePicker(!showDatePicker)}
                                                        style={{
                                                            padding: 12,
                                                            borderWidth: 1,
                                                            borderColor: '#ddd',
                                                            borderRadius: 5,
                                                            marginBottom: 15,
                                                            backgroundColor: '#f9f9f9'
                                                        }}
                                                    >
                                                        <Text style={{ fontSize: 14, color: '#333' }}>
                                                            Date: {formatFullDate(selectedDate)}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    {showDatePicker && Platform.OS === 'ios' && (
                                                        <View style={{
                                                            backgroundColor: '#fff',
                                                            borderRadius: 10,
                                                            marginBottom: 15,
                                                            overflow: 'hidden'
                                                        }}>
                                                            <DateTimePicker
                                                                value={selectedDate}
                                                                mode="date"
                                                                display="inline"
                                                                onChange={onDateChange}
                                                                maximumDate={new Date()}
                                                                style={{ height: 180 }}
                                                            />
                                                        </View>
                                                    )}

                                                    {showDatePicker && Platform.OS === 'android' && (
                                                        <DateTimePicker
                                                            value={selectedDate}
                                                            mode="date"
                                                            display="default"
                                                            onChange={onDateChange}
                                                            maximumDate={new Date()}
                                                        />
                                                    )}


                                                    <Button
                                                        mode="contained"
                                                        onPress={handleConfirm}
                                                        disabled={!amount || isNaN(parseFloat(amount))}
                                                    >
                                                        Confirm
                                                    </Button>
                                                </>
                                            )}
                                                </ScrollView>
                                            </View>
                                        </TouchableWithoutFeedback>
                                    </View>
                                </TouchableWithoutFeedback>
                            </KeyboardAvoidingView>
                        </Modal>
                    )}
                </ScrollView>

                <TouchableOpacity onPress={cycleSummaryMode}>
                    <Card style={{
                        margin: 10,
                        padding: 15,
                        backgroundColor: '#f5f5f5',
                        elevation: 4
                    }}>
                        <View style = {{display: 'flex', flexDirection: "row", justifyContent: "space-between"}}>
                            <Text style={{
                                textAlign: 'center',
                                fontSize: 12,
                                color: '#666',
                                marginBottom: 5
                            }}>
                                {summaryMode.includes('q') ? `Q${summaryMode.slice(1)}` : 'Total'}
                            </Text>
                            <Text style={{
                                textAlign: 'center',
                                fontSize: 12,
                                color: '#666',
                                marginBottom: 5
                            }}>
                                {`Federal Tax: ${totalTax?.federal?.toFixed(2) ?? 0}    ${state} Tax: ${totalTax?.state?.toFixed(2) ?? 0}`}
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontSize: 16 }}>Income</Text>
                                <Text style={{
                                    fontSize: 16,
                                    color: config.app.theme.purple
                                }}>
                                    ${totalIncome.toFixed(2)}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontSize: 16 }}>Expenses</Text>
                                <Text style={{
                                    fontSize: 16,
                                    color: config.app.theme.purple
                                }}>
                                    ${totalExpenses.toFixed(2)}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ fontSize: 16 }}>Revenue</Text>
                                <Text style={{
                                    fontSize: 16,
                                    color: totalRevenue >= 0 ? config.app.theme.purple : 'black'
                                }}>
                                    ${totalRevenue.toFixed(2)}
                                </Text>
                            </View>
                        </View>
                    </Card>
                </TouchableOpacity>

                <Button
                    style={{ margin: 5 }}
                    mode="contained"
                    onPress={() => {
                        setModalType('addJob');
                        setShowModal(true);
                    }}
                >
                    Add Job
                </Button>
            </GestureHandlerRootView>
        </Provider>
    );
};

export default Jobs;
