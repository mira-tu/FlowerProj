const formatTimestamp = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    hours = String(hours).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return dateString;
  }
};

const formatMessageTimestamp = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();

    const isToday = now.toDateString() === date.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMessageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = startOfToday.getTime() - startOfMessageDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return '1 day ago';
    }

    return `${diffDays} days ago`;

  } catch (e) {
    return dateString;
  }
};

const getStatusLabel = (status) => {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

const getStatusColor = (status) => {
  switch (status) {
    case 'completed': return '#4CAF50';
    case 'claimed': return '#4CAF50';
    case 'ready_for_pick_up': return '#6366F1';
    case 'out_for_delivery': return '#8B5CF6';
    case 'processing': return '#2196F3';
    case 'accepted': return '#0891B2'; // Teal - between pending and processing
    case 'cancelled': return '#f44336';
    case 'pending': return '#FFA726';
    default: return '#999';
  }
};

const getPaymentStatusDisplay = (paymentStatus, paymentMethod) => {
  if (paymentStatus === 'to_pay' && paymentMethod?.toLowerCase() === 'gcash') {
    return 'Waiting for Confirmation';
  }
  return getStatusLabel(paymentStatus);
};

export {
  formatTimestamp,
  formatMessageTimestamp,
  getStatusLabel,
  getStatusColor,
  getPaymentStatusDisplay,
};
