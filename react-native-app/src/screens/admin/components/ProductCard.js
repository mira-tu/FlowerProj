import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const ProductCard = ({
  imageUrl,
  name,
  category,
  description,
  priceText,
  stockText,
  showDescription = false,
  showActions = false,
  onEdit,
  onDelete,
  children,
}) => (
  <View style={styles.productCard}>
    <View style={styles.imageContainer}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.productImage}
        />
      ) : (
        <View style={styles.productImagePlaceholder}>
          <Ionicons name="image-outline" size={40} color="#ccc" />
          <Text style={styles.placeholderText}>No Image</Text>
        </View>
      )}
    </View>

    <View style={styles.productInfo}>
      <Text style={styles.productName}>{name}</Text>
      <Text style={styles.productCategory}>{category}</Text>
      {showDescription && description && <Text style={styles.productDescription}>{description}</Text>}

      <View style={styles.priceRow}>
        <Text style={styles.productPrice}>{priceText}</Text>
        <Text style={styles.productStock}>{stockText}</Text>
      </View>
      {children}
    </View>

    {showActions && (
      <View style={styles.productActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={onEdit}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    )}
  </View>
);

export default ProductCard;
