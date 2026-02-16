import React, { useState, useEffect, useCallback } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import { formatMessageTimestamp } from '../adminHelpers';

const MessagingTab = ({ customerToMessage, setCustomerToMessage }) => {
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const flatListRef = React.useRef(null);
    const navigation = useNavigation();

    // Memoized fetchConversations
    const fetchConversations = React.useCallback(async (user) => {
        if (!user || !(user.role === 'admin' || user.role === 'employee')) {
            setConversations([]);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_shared_conversations');
            if (error) throw error;
            const conversationsData = data || [];
            setConversations(conversationsData);
        } catch (error) {
            console.error("Error fetching shared conversations:", error);
            Alert.alert('Error', 'Could not fetch conversations. Please ensure database functions are installed correctly.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Memoized fetchMessages
    const fetchMessages = React.useCallback(async (conversation, user) => {
        if (!user || !conversation) return;
        const customerId = conversation.user.id;
        setSelectedConversation(conversation);
        setLoading(true);
        try {
            if (conversation.unreadCount > 0) {
                await supabase.from('messages').update({ is_read: true }).eq('sender_id', customerId).eq('is_read', false);
                fetchConversations(user);
            }
            const { data, error } = await supabase.rpc('get_conversation_messages', { p_customer_id: customerId });
            if (error) throw error;
            const messagesWithDetails = await Promise.all((data || []).map(async (msg) => {
                const { data: sender } = await supabase.from('users').select('id, name, role').eq('id', msg.sender_id).single();
                return { ...msg, sender };
            }));
            setMessages(messagesWithDetails);
        } catch (error) {
            console.error("Error fetching messages:", error);
            Alert.alert('Error', 'Could not fetch message history.');
        } finally {
            setLoading(false);
        }
    }, [fetchConversations]);

    // Get current user from AsyncStorage
    useEffect(() => {
        const loadInitialData = async () => {
            const userJson = await AsyncStorage.getItem('currentUser');
            if (userJson) setCurrentUser(JSON.parse(userJson));
            else navigation.navigate('Login');
        };
        loadInitialData();
    }, [navigation]);

    // Fetch conversations when user is loaded
    useFocusEffect(
        React.useCallback(() => {
            if (currentUser) {
                fetchConversations(currentUser);
            }
        }, [currentUser, fetchConversations])
    );

    // Real-time subscription for when the user is actively in a chat
    useEffect(() => {
        if (!currentUser || !selectedConversation) return;

        const channel = supabase.channel(`messaging-tab-realtime-${currentUser.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const customerInChatId = selectedConversation.user.id;
                const newMessage = payload.new;
                // If the new message belongs to the currently open conversation, refetch messages
                if (newMessage.sender_id === customerInChatId || newMessage.receiver_id === customerInChatId) {
                    fetchMessages(selectedConversation, currentUser);
                }
            }).subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, selectedConversation, fetchMessages]);

    // Effect to handle customer selected from another tab
    useEffect(() => {
        if (customerToMessage && currentUser) {
            const customerConversation = {
                user: {
                    id: customerToMessage.id,
                    name: customerToMessage.name,
                    email: customerToMessage.email,
                },
            };
            fetchMessages(customerConversation, currentUser);
            setCustomerToMessage(null); // Reset after processing
        }
    }, [customerToMessage, currentUser, fetchMessages, setCustomerToMessage]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedConversation || !currentUser) return;
        const receiverId = selectedConversation.user.id;
        const messageText = newMessage.trim();
        setNewMessage('');

        try {
            const { error } = await supabase.rpc('send_message_as_staff', {
                p_receiver_id: receiverId,
                p_message_text: messageText
            });
            if (error) throw error;
            // Optimistically update UI - for simplicity, we just refetch
            fetchMessages(selectedConversation, currentUser);
        } catch (error) {
            console.error("Error sending message:", error);
            Alert.alert('Error', error.message || 'Could not send message.');
            setNewMessage(messageText);
        }
    };

    const renderConversationItem = ({ item }) => {
        const isUnread = item.unreadCount > 0;
        return (
            <TouchableOpacity style={styles.chatItem} onPress={() => fetchMessages(item, currentUser)}>
                <View style={styles.chatAvatar}>
                    <Text style={styles.chatAvatarText}>{item.user.name ? item.user.name.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
                <View style={styles.chatPreview}>
                    <Text style={[styles.chatName, isUnread && styles.chatNameUnread]}>{item.user.name || 'Unknown User'}</Text>
                    <Text style={[styles.chatMessage, isUnread && styles.chatMessageUnread]} numberOfLines={1}>{item.lastMessage}</Text>
                </View>
                <View style={styles.chatMeta}>
                    <Text style={styles.chatUserTime}>{formatMessageTimestamp(item.timestamp)}</Text>
                    {isUnread && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>{item.unreadCount}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderMessageItem = ({ item }) => {
        const isSentByMe = item.sender_id === currentUser.id;
        return (
            <View style={[styles.messageWrapper, isSentByMe ? styles.messageSentWrapper : styles.messageReceivedWrapper]}>
                {!isSentByMe && (
                    <View style={styles.messageAvatar}>
                        <Text style={styles.chatAvatarText}>{item.sender && item.sender.name ? item.sender.name.charAt(0).toUpperCase() : 'U'}</Text>
                    </View>
                )}
                <View style={[styles.messageBubble, isSentByMe ? styles.messageSentBubble : styles.messageReceivedBubble]}>
                    <Text style={isSentByMe ? styles.messageTextSent : styles.messageTextReceived}>{item.message}</Text>
                    <Text style={[styles.messageTime, isSentByMe ? styles.messageTimeSent : styles.messageTimeReceived]}>{formatMessageTimestamp(item.created_at)}</Text>
                </View>
            </View>
        );
    };

    if (selectedConversation) {
        return (
            <View style={styles.tabContent}>
                <View style={styles.chatHeader}>
                    <TouchableOpacity onPress={() => setSelectedConversation(null)}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.chatHeaderTitle}>{selectedConversation.user.name}</Text>
                    <View style={{ width: 24 }} />
                </View>
                {loading && messages.length === 0 ? (<ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" />) : (
                    <FlatList
                        ref={flatListRef} data={messages} renderItem={renderMessageItem} keyExtractor={(item) => item.id.toString()}
                        style={styles.chatMessagesContainer} contentContainerStyle={{ padding: 10 }}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    />
                )}
                <View style={styles.chatInputContainer}>
                    <TextInput style={styles.chatInput} placeholder="Type a message..." value={newMessage} onChangeText={setNewMessage} onSubmitEditing={handleSendMessage} placeholderTextColor="#999" />
                    <TouchableOpacity style={styles.chatSendButton} onPress={handleSendMessage}><Ionicons name="send" size={20} color="#fff" /></TouchableOpacity>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>Conversations</Text>
            {loading && !conversations.length ? (<ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" />) : (
                <FlatList
                    data={conversations} renderItem={renderConversationItem} keyExtractor={(item) => item.user?.id?.toString()}
                    onRefresh={() => fetchConversations(currentUser)} refreshing={loading}
                    ListEmptyComponent={<Text style={styles.emptyText}>No conversations found.</Text>}
                />
            )}
        </View>
    );
};



export default MessagingTab;
