import { supabase } from '../config/supabase';

const isDataImageUrl = (value) => (
  typeof value === 'string' && value.startsWith('data:image')
);

const buildUploadFileName = ({ userId, itemIndex, label, fileExt }) => (
  `request-images/${userId || 'guest'}-${Date.now()}-${itemIndex}-${label}.${fileExt || 'png'}`
);

export const uploadRequestDataImage = async ({
  dataUrl,
  userId,
  itemIndex = 0,
  label = 'image',
}) => {
  if (!isDataImageUrl(dataUrl)) {
    return dataUrl || null;
  }

  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const fileExt = blob.type.split('/')[1] || 'png';
    const fileName = buildUploadFileName({ userId, itemIndex, label, fileExt });

    const { error: uploadError } = await supabase.storage
      .from('request-images')
      .upload(fileName, blob, { contentType: blob.type || 'image/png' });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = supabase.storage.from('request-images').getPublicUrl(fileName);
    return urlData?.publicUrl || null;
  } catch (error) {
    console.error(`Error uploading request image for ${label}:`, error);
    return null;
  }
};

const sanitizeArrangementSelection = async (selection, userId, itemIndex, selectionIndex) => {
  const inspirationImageUrl = await uploadRequestDataImage({
    dataUrl: selection?.inspirationImageBase64 || selection?.inspiration_image_base64 || null,
    userId,
    itemIndex,
    label: `arrangement-${selectionIndex}-inspiration`,
  });

  const {
    inspirationImageBase64: _inspirationImageBase64,
    inspiration_image_base64: _inspiration_image_base64,
    ...cleanSelection
  } = selection || {};

  return {
    ...cleanSelection,
    inspiration_image_url: inspirationImageUrl,
  };
};

export const uploadBookingRequestImages = async (items = [], userId) => Promise.all(
  (Array.isArray(items) ? items : []).map(async (item, itemIndex) => {
    const inspirationImageUrl = await uploadRequestDataImage({
      dataUrl: item?.inspirationImageBase64 || null,
      userId,
      itemIndex,
      label: 'inspiration',
    });
    const otherArrangementImageUrl = await uploadRequestDataImage({
      dataUrl: item?.otherArrangementImageBase64 || null,
      userId,
      itemIndex,
      label: 'other-arrangement',
    });
    const otherFlowersImageUrl = await uploadRequestDataImage({
      dataUrl: item?.otherFlowersImageBase64 || null,
      userId,
      itemIndex,
      label: 'other-flowers',
    });

    const arrangementSelections = await Promise.all(
      (Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : []).map((selection, selectionIndex) => (
        sanitizeArrangementSelection(selection, userId, itemIndex, selectionIndex)
      ))
    );

    const nestedInspirationUrl = arrangementSelections.find((selection) => selection?.inspiration_image_url)?.inspiration_image_url || null;

    const {
      inspirationImageBase64: _inspirationImageBase64,
      otherArrangementImageBase64: _otherArrangementImageBase64,
      otherFlowersImageBase64: _otherFlowersImageBase64,
      deliveryAddress,
      ...cleanItem
    } = item || {};

    return {
      ...cleanItem,
      arrangementSelections,
      image_url: item?.image_url || inspirationImageUrl || nestedInspirationUrl || otherArrangementImageUrl || otherFlowersImageUrl || null,
      inspiration_image_url: inspirationImageUrl || nestedInspirationUrl || null,
      other_arrangement_image_url: otherArrangementImageUrl,
      other_flowers_image_url: otherFlowersImageUrl,
      reference_images: {
        inspiration: inspirationImageUrl || nestedInspirationUrl || null,
        other_arrangement: otherArrangementImageUrl,
        other_flowers: otherFlowersImageUrl,
      },
      deliveryAddress: deliveryAddress || null,
    };
  })
);
