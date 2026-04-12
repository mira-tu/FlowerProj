import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { supabase } from '../config/supabase';
import { formatPhoneNumber } from '../utils/format';
import { getUserContactNumber, getUserFullName } from '../utils/customerProfile';
import { BUSINESS_HOURS_LABEL, CUSTOM_ORDER_TIME_MAX, CUSTOM_ORDER_TIME_MIN, isWithinBusinessHours } from '../utils/businessHours';
import { buildTentativeBreakdownFromSelections, formatTentativePriceRange } from '../utils/customOrderTentativePricing';
import {
    CUSTOM_ORDER_CATALOG_KEY as SHARED_CUSTOM_ORDER_CATALOG_KEY,
    DEFAULT_CUSTOM_ORDER_CATALOG as SHARED_DEFAULT_CUSTOM_ORDER_CATALOG,
    buildGroupedArrangementOptions as buildSharedGroupedArrangementOptions,
    fetchCustomOrderCatalog as fetchSharedCustomOrderCatalog,
    normalizeCustomOrderCatalog as normalizeSharedCustomOrderCatalog,
} from '../utils/customOrderCatalog';
import InfoModal from '../components/InfoModal';
import '../styles/CustomOrder.css';
import '../styles/Shop.css';

const flowerOptions = [
    { value: 'Roses', label: 'Roses', img: 'https://images.pexels.com/photos/56866/garden-rose-red-pink-56866.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Tulips', label: 'Tulips', img: 'https://images.pexels.com/photos/36753/flower-purple-lical-blosso.jpg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Sunflowers', label: 'Sunflowers', img: 'https://images.pexels.com/photos/1002703/pexels-photo-1002703.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Lilies', label: 'Lilies', img: 'https://images.pexels.com/photos/6629632/pexels-photo-6629632.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Orchids', label: 'Orchids', img: 'https://images.pexels.com/photos/132474/pexels-photo-132474.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Carnations', label: 'Carnations', img: 'https://images.pexels.com/photos/14532594/pexels-photo-14532594.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Mixed Flowers', label: 'Mixed Flowers', img: 'https://images.pexels.com/photos/931162/pexels-photo-931162.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { value: 'Others', label: 'Others', img: 'https://images.pexels.com/photos/931173/pexels-photo-931173.jpeg?auto=compress&cs=tinysrgb&w=800' }
];

const arrangementOptions = [
    {
        label: 'Funeral',
        options: [
            {
                value: 'Funeral Wreath (Large, 100 flowers)',
                label: 'Funeral Wreath (Large, 100 flowers)',
                description: 'Grand circular tribute arrangement for memorial ceremonies and chapel displays.',
                img: 'https://images.pexels.com/photos/931166/pexels-photo-931166.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Funeral Wreath (Medium, 50 flowers)',
                label: 'Funeral Wreath (Medium, 50 flowers)',
                description: 'Balanced wreath size ideal for intimate memorial services and family offerings.',
                img: 'https://images.pexels.com/photos/2479312/pexels-photo-2479312.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Funeral Flower Stand (Large, 100 flowers)',
                label: 'Funeral Flower Stand (Large, 100 flowers)',
                description: 'Tall standing floral tribute with fuller blooms for ceremonial entrances.',
                img: 'https://images.pexels.com/photos/1739347/pexels-photo-1739347.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Funeral Flower Stand (Medium, 50 flowers)',
                label: 'Funeral Flower Stand (Medium, 50 flowers)',
                description: 'Medium-sized stand arrangement that offers elegant sympathy presentation.',
                img: 'https://images.pexels.com/photos/1169084/pexels-photo-1169084.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)',
                label: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)',
                description: 'Large heart tribute that symbolizes love and remembrance for the departed.',
                img: 'https://images.pexels.com/photos/696996/pexels-photo-696996.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)',
                label: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)',
                description: 'Meaningful heart-shaped sympathy wreath with a softer floral silhouette.',
                img: 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
        ]
    },
    {
        label: 'Bridal / Wedding',
        options: [
            {
                value: 'Bridal Bouquet (20 flowers)',
                label: 'Bridal Bouquet (20 flowers)',
                description: 'Signature wedding bouquet designed for the bride with premium bloom selection.',
                img: 'https://images.pexels.com/photos/931171/pexels-photo-931171.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Bridesmaid Bouquet (10 flowers)',
                label: 'Bridesmaid Bouquet (10 flowers)',
                description: 'Coordinated bouquet style for bridesmaids that complements the bridal theme.',
                img: 'https://images.pexels.com/photos/6032926/pexels-photo-6032926.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Corsage (3 flowers)',
                label: 'Corsage (3 flowers)',
                description: 'Delicate wearable floral accent for formal events and entourage members.',
                img: 'https://images.pexels.com/photos/931176/pexels-photo-931176.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
        ]
    },
    {
        label: 'General',
        options: [
            {
                value: 'Table Centerpiece (12 flowers)',
                label: 'Table Centerpiece (12 flowers)',
                description: 'Low-profile arrangement perfect for dining tables and reception decor.',
                img: 'https://images.pexels.com/photos/1070850/pexels-photo-1070850.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Flower Box (Medium, 9 flowers)',
                label: 'Flower Box (Medium, 9 flowers)',
                description: 'Compact flower box suited for thoughtful gifting and personal celebrations.',
                img: 'https://images.pexels.com/photos/2111192/pexels-photo-2111192.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
            {
                value: 'Flower Box (Large, 15 flowers)',
                label: 'Flower Box (Large, 15 flowers)',
                description: 'Larger boxed arrangement with fuller volume for statement gifting.',
                img: 'https://images.pexels.com/photos/931170/pexels-photo-931170.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
        ]
    },
    {
        label: 'Custom',
        options: [
            {
                value: 'Other',
                label: 'Others (Specify below)',
                description: 'Request a fully custom design and specify arrangement details below.',
                img: 'https://images.pexels.com/photos/931174/pexels-photo-931174.jpeg?auto=compress&cs=tinysrgb&w=1200'
            },
        ]
    }
];

const flattenedArrangementOptions = arrangementOptions.flatMap((group) => group.options);

const extractFlowersPerArrangement = (arrangementLabel = '') => {
    if (!arrangementLabel) return 0;
    const match = arrangementLabel.match(/(\d+)\s*flowers?/i);
    if (!match) return 0;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : 0;
};

const dedupeFlowerOptions = (optionLists = []) => {
    const uniqueOptions = [];
    const seenValues = new Set();

    optionLists.flat().forEach((option) => {
        if (!option) return;
        const key = String(option.value || option.label || '').trim();
        if (!key || seenValues.has(key)) return;
        seenValues.add(key);
        uniqueOptions.push(option);
    });

    return uniqueOptions;
};

const buildCombinedOtherFlowersText = (otherFlowersTextByArrangement = {}) => (
    Array.from(
        new Set(
            Object.values(otherFlowersTextByArrangement || {})
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )
    ).join(', ')
);

const cloneFlowerOptionList = (options = []) => (
    Array.isArray(options)
        ? options.filter(Boolean).slice()
        : []
);

const buildArrangementUnitKey = (arrangementValue, unitIndex) => (
    `${String(arrangementValue || '').trim()}::unit-${Number(unitIndex) || 1}`
);

const buildArrangementFlowerUnitMaps = ({
    selectedValues = [],
    arrangementQuantities = {},
    existingPreferredByUnit = {},
    existingOtherFlowersByUnit = {},
    fallbackPreferredByArrangement = {},
    fallbackOtherFlowersByArrangement = {},
}) => {
    const nextPreferredFlowersByUnit = {};
    const nextOtherFlowersTextByUnit = {};

    (Array.isArray(selectedValues) ? selectedValues : []).forEach((arrangementValue) => {
        const parsedQty = Number.parseInt(arrangementQuantities?.[arrangementValue], 10);
        const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
        const arrangementFallbackFlowers = cloneFlowerOptionList(fallbackPreferredByArrangement?.[arrangementValue]);
        const arrangementFallbackOtherFlowers = String(
            fallbackOtherFlowersByArrangement?.[arrangementValue] || ''
        );

        let lastUnitFlowers = arrangementFallbackFlowers;
        let lastUnitOtherFlowersText = arrangementFallbackOtherFlowers;

        for (let unitIndex = 1; unitIndex <= quantity; unitIndex += 1) {
            const unitKey = buildArrangementUnitKey(arrangementValue, unitIndex);
            const existingFlowers = cloneFlowerOptionList(existingPreferredByUnit?.[unitKey]);
            const existingOtherFlowersText = String(existingOtherFlowersByUnit?.[unitKey] || '');
            const nextFlowers = existingFlowers.length
                ? existingFlowers
                : cloneFlowerOptionList(lastUnitFlowers);
            const nextOtherFlowersText = existingOtherFlowersText || lastUnitOtherFlowersText || '';

            nextPreferredFlowersByUnit[unitKey] = nextFlowers;
            nextOtherFlowersTextByUnit[unitKey] = nextOtherFlowersText;
            lastUnitFlowers = nextFlowers;
            lastUnitOtherFlowersText = nextOtherFlowersText;
        }
    });

    return {
        nextPreferredFlowersByUnit,
        nextOtherFlowersTextByUnit,
    };
};

const colorOptions = [
    { value: 'Pastel Pinks and Whites', label: 'Pastel Pinks and Whites', colors: ['#ffc0cb', '#ffffff'] },
    { value: 'Rustic Autumn Colors', label: 'Rustic Autumn Colors', colors: ['#d2691e', '#8b4513', '#cd853f'] },
    { value: 'Classic Red and White', label: 'Classic Red and White', colors: ['#ff0000', '#ffffff'] },
    { value: 'All White / Elegant', label: 'All White / Elegant', colors: ['#ffffff', '#f5f5f5'] },
    { value: 'Vibrant / Colorful', label: 'Vibrant / Colorful', colors: ['#ff0000', '#ffff00', '#0000ff'] },
    { value: 'Soft Blues and Purples', label: 'Soft Blues and Purples', colors: ['#add8e6', '#800080'] },
    { value: 'Others', label: 'Others', colors: [] }
];

const CUSTOM_ORDER_CATALOG_KEY = 'custom_order_catalog';

const DEFAULT_CUSTOM_ORDER_CATALOG = {
    version: 1,
    flowers: flowerOptions.map((item, index) => ({
        id: `flower-${index + 1}`,
        value: item.value,
        label: item.label,
        img: item.img,
        isActive: true,
    })),
    arrangements: flattenedArrangementOptions.map((item, index) => ({
        id: `arrangement-${index + 1}`,
        value: item.value,
        label: item.label,
        groupLabel: arrangementOptions.find((group) => group.options.some((option) => option.value === item.value))?.label || 'General',
        description: item.description || '',
        img: item.img || '',
        flowersPerArrangement: extractFlowersPerArrangement(item.label),
        isActive: true,
    })),
    colors: colorOptions.map((item, index) => ({
        id: `color-${index + 1}`,
        value: item.value,
        label: item.label,
        colors: item.colors,
        isActive: true,
    }))
};

const makeCatalogItemId = (value, prefix) => {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized ? `${prefix}-${normalized}` : `${prefix}-${Date.now()}`;
};

const toPositiveInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
};

const normalizeCatalogImage = (value) => String(value || '').trim();

const normalizeCatalogColorSwatches = (colors = []) => (
    Array.isArray(colors)
        ? colors
            .map((color) => String(color || '').trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
);

const normalizeFlowerCatalogItem = (item, index) => {
    const label = String(item?.label || item?.value || `Flower ${index + 1}`).trim();
    const value = String(item?.value || label).trim();

    return {
        id: String(item?.id || makeCatalogItemId(value || label, 'flower')),
        value: value || `flower-${index + 1}`,
        label,
        img: normalizeCatalogImage(item?.img),
        isActive: item?.isActive !== false,
    };
};

const normalizeArrangementCatalogItem = (item, index) => {
    const label = String(item?.label || item?.value || `Arrangement ${index + 1}`).trim();
    const value = String(item?.value || label).trim();
    const flowersPerArrangement = toPositiveInteger(
        item?.flowersPerArrangement,
        extractFlowersPerArrangement(label)
    );

    return {
        id: String(item?.id || makeCatalogItemId(value || label, 'arrangement')),
        value: value || `arrangement-${index + 1}`,
        label,
        groupLabel: String(item?.groupLabel || 'General').trim() || 'General',
        description: String(item?.description || '').trim(),
        img: normalizeCatalogImage(item?.img),
        flowersPerArrangement,
        isActive: item?.isActive !== false,
    };
};

const normalizeColorCatalogItem = (item, index) => {
    const label = String(item?.label || item?.value || `Color ${index + 1}`).trim();
    const value = String(item?.value || label).trim();

    return {
        id: String(item?.id || makeCatalogItemId(value || label, 'color')),
        value: value || `color-${index + 1}`,
        label,
        colors: normalizeCatalogColorSwatches(item?.colors),
        isActive: item?.isActive !== false,
    };
};

const normalizeCustomOrderCatalog = (catalog) => {
    const sourceCatalog = catalog && typeof catalog === 'object' ? catalog : DEFAULT_CUSTOM_ORDER_CATALOG;

    return {
        version: toPositiveInteger(sourceCatalog.version, 1) || 1,
        flowers: (Array.isArray(sourceCatalog.flowers) && sourceCatalog.flowers.length
            ? sourceCatalog.flowers
            : DEFAULT_CUSTOM_ORDER_CATALOG.flowers
        )
            .map(normalizeFlowerCatalogItem)
            .filter((item) => item.label),
        arrangements: (Array.isArray(sourceCatalog.arrangements) && sourceCatalog.arrangements.length
            ? sourceCatalog.arrangements
            : DEFAULT_CUSTOM_ORDER_CATALOG.arrangements
        )
            .map(normalizeArrangementCatalogItem)
            .filter((item) => item.label),
        colors: (Array.isArray(sourceCatalog.colors) && sourceCatalog.colors.length
            ? sourceCatalog.colors
            : DEFAULT_CUSTOM_ORDER_CATALOG.colors
        )
            .map(normalizeColorCatalogItem)
            .filter((item) => item.label),
    };
};

const buildGroupedArrangementOptions = (arrangements = []) => {
    const groupedOptions = new Map();

    arrangements.forEach((item) => {
        const groupLabel = String(item?.groupLabel || 'General').trim() || 'General';
        if (!groupedOptions.has(groupLabel)) {
            groupedOptions.set(groupLabel, []);
        }

        groupedOptions.get(groupLabel).push({
            value: item.value,
            label: item.label,
            groupLabel,
            description: item.description || '',
            img: item.img || '',
            flowersPerArrangement: item.flowersPerArrangement || 0,
        });
    });

    return Array.from(groupedOptions.entries()).map(([label, options]) => ({
        label,
        options,
    }));
};

const fetchCustomOrderCatalog = async () => {
    try {
        const { data, error } = await supabase
            .from('app_content')
            .select('value')
            .eq('key', CUSTOM_ORDER_CATALOG_KEY)
            .maybeSingle();

        if (error || !data?.value) {
            return normalizeCustomOrderCatalog(DEFAULT_CUSTOM_ORDER_CATALOG);
        }

        return normalizeCustomOrderCatalog(JSON.parse(data.value));
    } catch (error) {
        console.error('Error loading custom order catalog:', error);
        return normalizeCustomOrderCatalog(DEFAULT_CUSTOM_ORDER_CATALOG);
    }
};

const customColorOptionLabel = ({ label, colors }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        {colors && colors.length > 0 && (
            <div style={{ display: 'flex', marginRight: '10px' }}>
                {colors.map((color, index) => (
                    <div
                        key={index}
                        style={{
                            width: '15px',
                            height: '15px',
                            backgroundColor: color,
                            borderRadius: '50%',
                            marginLeft: index > 0 ? '-5px' : '0',
                            border: '1px solid #ccc'
                        }}
                    ></div>
                ))}
            </div>
        )}
        <span>{label}</span>
    </div>
);

const renderFlowerOptionLabel = (option, context, onPreview) => {
    if (context === 'value') {
        return <span>{option.label}</span>;
    }

    return (
        <div className="flower-option">
            <button
                type="button"
                className="flower-option__image-button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onPreview === 'function') {
                        onPreview(option);
                    }
                }}
                aria-label={'Preview ' + option.label}
                title="Click to preview"
            >
                <img src={option.img} alt={option.label} className="flower-option__image" />
            </button>
            <span className="flower-option__label">{option.label}</span>
            <button
                type="button"
                className="flower-option__zoom"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onPreview === 'function') {
                        onPreview(option);
                    }
                }}
                aria-label={'Expand preview for ' + option.label}
                title="Preview image"
            >
                <i className="fas fa-expand" aria-hidden="true"></i>
            </button>
        </div>
    );
};

const renderArrangementOptionLabel = (option, context, onPreview) => {
    if (context === 'value') {
        return <span>{option.label}</span>;
    }

    return (
        <div className="arrangement-option">
            <button
                type="button"
                className="arrangement-option__image-button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onPreview === 'function') {
                        onPreview(option);
                    }
                }}
                aria-label={'Preview ' + option.label}
                title="Click to preview"
            >
                <img
                    src={option.img}
                    alt={option.label}
                    className="arrangement-option__image"
                />
            </button>
            <div className="arrangement-option__content">
                <div className="arrangement-option__title">{option.label}</div>
                <div className="arrangement-option__description">{option.description}</div>
            </div>
            <button
                type="button"
                className="arrangement-option__zoom"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onPreview === 'function') {
                        onPreview(option);
                    }
                }}
                aria-label={'Preview ' + option.label}
                title="Preview image"
            >
                <i className="fas fa-expand" aria-hidden="true"></i>
            </button>
        </div>
    );
};

const buildMultiSelectStyles = (hasError) => ({
    control: (base, state) => ({
        ...base,
        border: hasError ? '1px solid #dc3545' : '1px solid rgba(240, 123, 150, 0.14)',
        backgroundColor: '#fffaf8',
        padding: '8px 10px',
        borderRadius: '18px',
        minHeight: '60px',
        boxShadow: state.isFocused ? '0 0 0 4px rgba(240, 123, 150, 0.12)' : 'none',
        transition: 'all 0.2s ease',
        '&:hover': {
            borderColor: hasError ? '#dc3545' : 'rgba(240, 123, 150, 0.4)'
        }
    }),
    valueContainer: (base) => ({
        ...base,
        gap: '6px',
        padding: 0
    }),
    placeholder: (base) => ({
        ...base,
        color: '#8f7f86'
    }),
    multiValue: (base) => ({
        ...base,
        backgroundColor: 'rgba(240, 123, 150, 0.14)',
        borderRadius: '999px',
        padding: '3px 6px'
    }),
    multiValueLabel: (base) => ({
        ...base,
        color: '#7a2444',
        fontWeight: 600,
        paddingRight: '6px'
    }),
    multiValueRemove: (base) => ({
        ...base,
        color: '#7a2444',
        borderRadius: '999px',
        ':hover': {
            backgroundColor: 'rgba(122, 36, 68, 0.12)',
            color: '#7a2444'
        }
    }),
    clearIndicator: (base) => ({
        ...base,
        color: '#b9a7af',
        ':hover': {
            color: '#7a2444'
        }
    }),
    dropdownIndicator: (base, state) => ({
        ...base,
        color: state.isFocused ? '#f07b96' : '#b9a7af',
        ':hover': {
            color: '#f07b96'
        }
    }),
    indicatorSeparator: () => ({
        display: 'none'
    }),
    menu: (base) => ({
        ...base,
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 18px 40px rgba(65, 35, 46, 0.12)'
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
            ? 'rgba(240, 123, 150, 0.16)'
            : state.isFocused
                ? '#fff2f5'
                : '#fff',
        color: '#41232e',
        cursor: 'pointer'
    }),
    groupHeading: (base) => ({
        ...base,
        fontWeight: 700,
        color: '#6c4b57',
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em'
    })
});

const CustomOrder = ({ user }) => {
    const [savedProfile, setSavedProfile] = useState(null);
    const fallbackUserName = getUserFullName(savedProfile || {}, user) || user?.email?.split('@')[0] || '';
    const fallbackUserPhone = getUserContactNumber(savedProfile || {}, user);
    const [formData, setFormData] = useState({
        customerName: fallbackUserName,
        email: user?.email || '',
        contactNumber: fallbackUserPhone,
        recipientName: fallbackUserName,
        occasion: '',
        otherOccasion: '',
        otherArrangementType: '',
        otherFlowersText: '',
        eventDate: '',
        eventTime: '',
        venue: '',
        selectedFlowers: [],
        preferredFlowersByArrangement: {},
        otherFlowersTextByArrangement: {},
        preferredFlowersByUnit: {},
        otherFlowersTextByUnit: {},
        colorPreferenceByArrangement: {},
        otherColorPreferenceByArrangement: {},
        inspirationImageByArrangement: {},
        arrangementTypes: [],
        arrangementQuantities: {},
        flowerQuantity: '',
        specialInstructions: ''
    });

    const [otherArrangementImagePreview, setOtherArrangementImagePreview] = useState(null);
    const [inspirationImageErrorsByArrangement, setInspirationImageErrorsByArrangement] = useState({});
    const [otherArrangementImageError, setOtherArrangementImageError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [arrangementPreviewOption, setArrangementPreviewOption] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null });
    const [dateError, setDateError] = useState('');
    const [timeError, setTimeError] = useState('');
    const [validated, setValidated] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const [customOrderCatalog, setCustomOrderCatalog] = useState(() => normalizeSharedCustomOrderCatalog(SHARED_DEFAULT_CUSTOM_ORDER_CATALOG));
    const appliedArrangementPrefillRef = useRef('');

    const preselectedArrangementValue = useMemo(() => {
        const searchParams = new URLSearchParams(location.search);
        return String(searchParams.get('arrangement') || location.state?.preselectedArrangement || '').trim();
    }, [location.search, location.state]);

    useEffect(() => {
        const fetchSavedProfile = async () => {
            if (!user?.id) {
                setSavedProfile(null);
                return;
            }

            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (error) {
                console.error('Error fetching saved customer profile for custom order form:', error);
                return;
            }

            setSavedProfile(data || null);
        };

        fetchSavedProfile();
    }, [user]);

    useEffect(() => {
        let isMounted = true;

        const loadCatalog = async () => {
            const loadedCatalog = await fetchSharedCustomOrderCatalog();
            if (isMounted) {
                setCustomOrderCatalog(loadedCatalog);
            }
        };

        loadCatalog();

        const catalogChannel = supabase
            .channel('custom_order_catalog_updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'app_content',
                    filter: `key=eq.${SHARED_CUSTOM_ORDER_CATALOG_KEY}`,
                },
                async () => {
                    const latestCatalog = await fetchSharedCustomOrderCatalog();
                    if (isMounted) {
                        setCustomOrderCatalog(latestCatalog);
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(catalogChannel);
        };
    }, []);

    const catalogFlowerOptions = useMemo(
        () => customOrderCatalog.flowers.filter((item) => item.isActive !== false),
        [customOrderCatalog]
    );

    const catalogArrangementOptions = useMemo(
        () => buildSharedGroupedArrangementOptions(customOrderCatalog.arrangements.filter((item) => item.isActive !== false)),
        [customOrderCatalog]
    );

    const flattenedCatalogArrangementOptions = useMemo(
        () => catalogArrangementOptions.flatMap((group) => group.options),
        [catalogArrangementOptions]
    );

    const catalogColorOptions = useMemo(
        () => customOrderCatalog.colors.filter((item) => item.isActive !== false),
        [customOrderCatalog]
    );

    const arrangementOptionLookup = useMemo(
        () => new Map(flattenedCatalogArrangementOptions.map((option) => [option.value, option])),
        [flattenedCatalogArrangementOptions]
    );

    const preselectedArrangementOption = useMemo(
        () => arrangementOptionLookup.get(preselectedArrangementValue) || null,
        [arrangementOptionLookup, preselectedArrangementValue]
    );

    const colorOptionLookup = useMemo(
        () => new Map(catalogColorOptions.map((option) => [option.value, option])),
        [catalogColorOptions]
    );

    const handleArrangementPreview = useCallback((option) => {
        setArrangementPreviewOption(option);
    }, []);

    const handleFlowerPreview = useCallback((option) => {
        setArrangementPreviewOption({
            img: option.img,
            label: option.label,
            description: 'Preferred flower option'
        });
    }, []);

    const flowerOptionLabel = useCallback(
        (option, { context }) => renderFlowerOptionLabel(option, context, handleFlowerPreview),
        [handleFlowerPreview]
    );

    const arrangementOptionLabel = useCallback(
        (option, { context }) => renderArrangementOptionLabel(option, context, handleArrangementPreview),
        [handleArrangementPreview]
    );

    useEffect(() => {
        if (user) {
            const userName = fallbackUserName;
            const userEmail = user?.email || '';
            const userPhone = fallbackUserPhone;

            setFormData(prev => ({
                ...prev,
                customerName: prev.customerName === '' ? userName : prev.customerName,
                email: prev.email === '' ? userEmail : prev.email,
                contactNumber: prev.contactNumber === '' ? userPhone : prev.contactNumber,
                recipientName: prev.recipientName === '' ? userName : prev.recipientName
            }));
        }
    }, [fallbackUserName, fallbackUserPhone, user]);

    useEffect(() => {
        if (!preselectedArrangementValue || appliedArrangementPrefillRef.current === preselectedArrangementValue) {
            return;
        }

        const arrangementOption = arrangementOptionLookup.get(preselectedArrangementValue);
        if (!arrangementOption) {
            return;
        }

        appliedArrangementPrefillRef.current = preselectedArrangementValue;

        setFormData((prev) => {
            const nextArrangementTypes = Array.isArray(prev.arrangementTypes)
                ? [...prev.arrangementTypes]
                : [];

            if (!nextArrangementTypes.includes(arrangementOption.value)) {
                nextArrangementTypes.unshift(arrangementOption.value);
            }

            const nextArrangementQuantities = { ...(prev.arrangementQuantities || {}) };
            if (!nextArrangementQuantities[arrangementOption.value] || Number.parseInt(nextArrangementQuantities[arrangementOption.value], 10) < 1) {
                nextArrangementQuantities[arrangementOption.value] = '1';
            }

            return {
                ...prev,
                arrangementTypes: nextArrangementTypes,
                arrangementQuantities: nextArrangementQuantities,
                preferredFlowersByArrangement: {
                    ...(prev.preferredFlowersByArrangement || {}),
                    [arrangementOption.value]: Array.isArray(prev.preferredFlowersByArrangement?.[arrangementOption.value])
                        ? prev.preferredFlowersByArrangement[arrangementOption.value]
                        : []
                },
                otherFlowersTextByArrangement: {
                    ...(prev.otherFlowersTextByArrangement || {}),
                    [arrangementOption.value]: prev.otherFlowersTextByArrangement?.[arrangementOption.value] || ''
                },
                colorPreferenceByArrangement: {
                    ...(prev.colorPreferenceByArrangement || {}),
                    [arrangementOption.value]: prev.colorPreferenceByArrangement?.[arrangementOption.value] || ''
                },
                otherColorPreferenceByArrangement: {
                    ...(prev.otherColorPreferenceByArrangement || {}),
                    [arrangementOption.value]: prev.otherColorPreferenceByArrangement?.[arrangementOption.value] || ''
                },
                inspirationImageByArrangement: {
                    ...(prev.inspirationImageByArrangement || {}),
                    [arrangementOption.value]: prev.inspirationImageByArrangement?.[arrangementOption.value] || null
                },
                ...buildArrangementFlowerUnitMaps({
                    selectedValues: nextArrangementTypes,
                    arrangementQuantities: nextArrangementQuantities,
                    existingPreferredByUnit: prev.preferredFlowersByUnit || {},
                    existingOtherFlowersByUnit: prev.otherFlowersTextByUnit || {},
                    fallbackPreferredByArrangement: {
                        ...(prev.preferredFlowersByArrangement || {}),
                        [arrangementOption.value]: Array.isArray(prev.preferredFlowersByArrangement?.[arrangementOption.value])
                            ? prev.preferredFlowersByArrangement[arrangementOption.value]
                            : []
                    },
                    fallbackOtherFlowersByArrangement: {
                        ...(prev.otherFlowersTextByArrangement || {}),
                        [arrangementOption.value]: prev.otherFlowersTextByArrangement?.[arrangementOption.value] || ''
                    },
                }),
            };
        });
    }, [arrangementOptionLookup, preselectedArrangementValue]);

    // Prevent past dates
    const minEventDate = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'contactNumber') {
            setFormData(prev => ({ ...prev, [name]: formatPhoneNumber(value) }));
            return;
        }

        let nextValue = value;
        if (name === 'eventDate' && value) {
            nextValue = value < minEventDate ? minEventDate : value;
        }

        setFormData(prev => ({ ...prev, [name]: nextValue }));
    };

    const handleArrangementUnitFlowerSelect = (arrangementValue, unitIndex, selectedOptions) => {
        const unitKey = buildArrangementUnitKey(arrangementValue, unitIndex);
        setFormData(prev => ({
            ...prev,
            preferredFlowersByUnit: {
                ...prev.preferredFlowersByUnit,
                [unitKey]: selectedOptions || []
            }
        }));
    };

    const handleArrangementUnitOtherFlowersChange = (arrangementValue, unitIndex, value) => {
        const unitKey = buildArrangementUnitKey(arrangementValue, unitIndex);
        setFormData(prev => ({
            ...prev,
            otherFlowersTextByUnit: {
                ...prev.otherFlowersTextByUnit,
                [unitKey]: value
            }
        }));
    };

    const selectedArrangementOptions = useMemo(
        () => formData.arrangementTypes
            .map((value) => arrangementOptionLookup.get(value))
            .filter(Boolean),
        [arrangementOptionLookup, formData.arrangementTypes]
    );

    const arrangementDetails = useMemo(() => {
        if (!selectedArrangementOptions.length) return [];

        return selectedArrangementOptions.map((option) => {
            const parsedQty = Number.parseInt(formData.arrangementQuantities?.[option.value], 10);
            const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
            const label = option.label;
            const flowersPerArrangement = Number(option.flowersPerArrangement) || extractFlowersPerArrangement(option.label);
            const estimatedPriceMin = Number(option.estimatedPriceMin) || 0;
            const estimatedPriceMax = Number(option.estimatedPriceMax) || estimatedPriceMin;
            const estimatedPriceNote = String(option.estimatedPriceNote || '').trim();

            return {
                value: option.value,
                label,
                img: option.img || '',
                description: option.description || '',
                quantity,
                flowersPerArrangement,
                totalFlowers: flowersPerArrangement > 0 ? flowersPerArrangement * quantity : 0,
                estimatedPriceMin,
                estimatedPriceMax,
                estimatedPriceNote,
                tentativeSubtotalMin: estimatedPriceMin > 0 ? estimatedPriceMin * quantity : 0,
                tentativeSubtotalMax: estimatedPriceMax > 0 ? estimatedPriceMax * quantity : 0,
                formattedEstimatedRange: formatTentativePriceRange(estimatedPriceMin, estimatedPriceMax, estimatedPriceNote),
                formattedTentativeSubtotal: estimatedPriceMin > 0 || estimatedPriceMax > 0
                    ? formatTentativePriceRange(estimatedPriceMin * quantity, estimatedPriceMax * quantity)
                    : 'To be quoted',
            };
        });
    }, [formData.arrangementQuantities, selectedArrangementOptions]);

    const arrangementSummary = useMemo(
        () => arrangementDetails.map((detail) => detail.label + ' x' + detail.quantity).join(', '),
        [arrangementDetails]
    );

    const totalArrangementQuantity = useMemo(
        () => arrangementDetails.reduce((sum, detail) => sum + detail.quantity, 0),
        [arrangementDetails]
    );

    const totalEstimatedFlowers = useMemo(
        () => arrangementDetails.reduce((sum, detail) => sum + detail.totalFlowers, 0),
        [arrangementDetails]
    );

    const tentativeBreakdown = useMemo(
        () => buildTentativeBreakdownFromSelections(arrangementDetails.map((detail) => ({
            arrangementLabel: detail.label,
            quantity: detail.quantity,
            estimatedPriceMin: detail.estimatedPriceMin,
            estimatedPriceMax: detail.estimatedPriceMax,
            estimatedPriceNote: detail.estimatedPriceNote,
            tentativeSubtotalMin: detail.tentativeSubtotalMin,
            tentativeSubtotalMax: detail.tentativeSubtotalMax,
        }))),
        [arrangementDetails]
    );

    const arrangementUnitDetails = useMemo(
        () => arrangementDetails.flatMap((detail) => (
            Array.from({ length: detail.quantity }, (_, index) => {
                const unitIndex = index + 1;
                const unitKey = buildArrangementUnitKey(detail.value, unitIndex);
                const unitLabel = detail.quantity > 1 ? `Unit ${unitIndex}` : null;
                return {
                    ...detail,
                    unitIndex,
                    unitKey,
                    unitCount: detail.quantity,
                    unitLabel,
                    unitDisplayLabel: unitLabel || 'Unit 1',
                };
            })
        )),
        [arrangementDetails]
    );

    const combinedSelectedFlowers = useMemo(
        () => dedupeFlowerOptions(Object.values(formData.preferredFlowersByUnit || {})),
        [formData.preferredFlowersByUnit]
    );

    const combinedOtherFlowersText = useMemo(
        () => buildCombinedOtherFlowersText(formData.otherFlowersTextByUnit),
        [formData.otherFlowersTextByUnit]
    );

    const combinedArrangementColorSummary = useMemo(
        () => arrangementDetails
            .map((detail) => {
                const selectedColor = formData.colorPreferenceByArrangement?.[detail.value] || '';
                if (!selectedColor) return null;
                const colorLabel = selectedColor;
                return colorLabel ? `${detail.label}: ${colorLabel}` : null;
            })
            .filter(Boolean)
            .join(' | '),
        [arrangementDetails, formData.colorPreferenceByArrangement]
    );

    const leadArrangementInspirationImage = useMemo(
        () => arrangementDetails
            .map((detail) => formData.inspirationImageByArrangement?.[detail.value] || null)
            .find(Boolean) || null,
        [arrangementDetails, formData.inspirationImageByArrangement]
    );

    const handleArrangementSelect = (selectedOptions) => {
        const selectedValues = (selectedOptions || []).map((option) => option.value);
        setFormData(prev => {
            const nextQuantities = {};
            const nextPreferredFlowersByArrangement = {};
            const nextOtherFlowersTextByArrangement = {};
            const nextColorPreferenceByArrangement = {};
            const nextOtherColorPreferenceByArrangement = {};
            const nextInspirationImageByArrangement = {};
            selectedValues.forEach((value) => {
                const existingQty = Number.parseInt(prev.arrangementQuantities?.[value], 10);
                nextQuantities[value] = Number.isFinite(existingQty) && existingQty > 0 ? String(existingQty) : '1';
                nextPreferredFlowersByArrangement[value] = Array.isArray(prev.preferredFlowersByArrangement?.[value])
                    ? prev.preferredFlowersByArrangement[value]
                    : [];
                nextOtherFlowersTextByArrangement[value] = prev.otherFlowersTextByArrangement?.[value] || '';
                nextColorPreferenceByArrangement[value] = prev.colorPreferenceByArrangement?.[value] || '';
                nextOtherColorPreferenceByArrangement[value] = prev.otherColorPreferenceByArrangement?.[value] || '';
                nextInspirationImageByArrangement[value] = prev.inspirationImageByArrangement?.[value] || null;
            });

            const nextState = {
                ...prev,
                arrangementTypes: selectedValues,
                arrangementQuantities: nextQuantities,
                preferredFlowersByArrangement: nextPreferredFlowersByArrangement,
                otherFlowersTextByArrangement: nextOtherFlowersTextByArrangement,
                ...buildArrangementFlowerUnitMaps({
                    selectedValues,
                    arrangementQuantities: nextQuantities,
                    existingPreferredByUnit: prev.preferredFlowersByUnit || {},
                    existingOtherFlowersByUnit: prev.otherFlowersTextByUnit || {},
                    fallbackPreferredByArrangement: nextPreferredFlowersByArrangement,
                    fallbackOtherFlowersByArrangement: nextOtherFlowersTextByArrangement,
                }),
                colorPreferenceByArrangement: nextColorPreferenceByArrangement,
                otherColorPreferenceByArrangement: nextOtherColorPreferenceByArrangement,
                inspirationImageByArrangement: nextInspirationImageByArrangement
            };

            return nextState;
        });
    };

    const handleArrangementQuantityChange = (arrangementValue, value) => {
        const digitsOnly = value.replace(/[^\d]/g, '');
        const nextValue = digitsOnly === '' ? '' : String(Math.max(1, Number.parseInt(digitsOnly, 10)));
        setFormData(prev => {
            const nextArrangementQuantities = {
                ...prev.arrangementQuantities,
                [arrangementValue]: nextValue
            };

            return {
                ...prev,
                arrangementQuantities: nextArrangementQuantities,
                ...buildArrangementFlowerUnitMaps({
                    selectedValues: prev.arrangementTypes,
                    arrangementQuantities: nextArrangementQuantities,
                    existingPreferredByUnit: prev.preferredFlowersByUnit || {},
                    existingOtherFlowersByUnit: prev.otherFlowersTextByUnit || {},
                    fallbackPreferredByArrangement: prev.preferredFlowersByArrangement || {},
                    fallbackOtherFlowersByArrangement: prev.otherFlowersTextByArrangement || {},
                }),
            };
        });
    };

    const handleArrangementQuantityStep = (arrangementValue, direction) => {
        const currentValue = Number.parseInt(formData.arrangementQuantities?.[arrangementValue], 10);
        const safeCurrentValue = Number.isFinite(currentValue) && currentValue > 0 ? currentValue : 1;
        const nextValue = Math.max(1, safeCurrentValue + direction);
        handleArrangementQuantityChange(arrangementValue, String(nextValue));
    };

    const handleArrangementColorSelect = (arrangementValue, selectedOption) => {
        setFormData(prev => ({
            ...prev,
            colorPreferenceByArrangement: {
                ...prev.colorPreferenceByArrangement,
                [arrangementValue]: selectedOption ? selectedOption.value : ''
            }
        }));
    };

    const handleArrangementOtherColorChange = (arrangementValue, value) => {
        setFormData(prev => ({
            ...prev,
            otherColorPreferenceByArrangement: {
                ...prev.otherColorPreferenceByArrangement,
                [arrangementValue]: value
            }
        }));
    };

    const compressToBase64 = (file, onDone) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                    const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                onDone(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };

    const handleArrangementInspirationImageChange = (arrangementValue, file) => {
        if (!file) return;

        if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
            setInspirationImageErrorsByArrangement((prev) => ({
                ...prev,
                [arrangementValue]: 'Please upload a JPG or PNG file.'
            }));
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setInspirationImageErrorsByArrangement((prev) => ({
                ...prev,
                [arrangementValue]: 'File size exceeds 5MB limit.'
            }));
            return;
        }

        setInspirationImageErrorsByArrangement((prev) => ({
            ...prev,
            [arrangementValue]: ''
        }));

        compressToBase64(file, (compressedBase64) => {
            setFormData((prev) => ({
                ...prev,
                inspirationImageByArrangement: {
                    ...prev.inspirationImageByArrangement,
                    [arrangementValue]: compressedBase64
                }
            }));
        });
    };

    const removeArrangementInspirationImage = (arrangementValue) => {
        setFormData((prev) => {
            const nextImages = { ...prev.inspirationImageByArrangement };
            delete nextImages[arrangementValue];
            return {
                ...prev,
                inspirationImageByArrangement: nextImages
            };
        });

        setInspirationImageErrorsByArrangement((prev) => ({
            ...prev,
            [arrangementValue]: ''
        }));
    };

    const handleOtherArrangementImageChange = (e) => {
        const file = e.target.files?.[0];
        setOtherArrangementImageError('');
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
            setOtherArrangementImageError('Please upload a JPG or PNG file.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setOtherArrangementImageError('File size exceeds 5MB limit.');
            return;
        }
        compressToBase64(file, setOtherArrangementImagePreview);
    };

    const removeOtherArrangementImage = () => {
        setOtherArrangementImagePreview(null);
        setOtherArrangementImageError('');
    };

    const triggerValidation = (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        if (form.checkValidity() === false) {
            e.stopPropagation();
            setValidated(true);

            // Find the first invalid element and scroll to it
            setTimeout(() => {
                const firstInvalid = form.querySelector(':invalid');
                if (firstInvalid) {
                    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Optional: add focus for accessibility
                    firstInvalid.focus({ preventScroll: true });
                }
            }, 100);

            // Generic missing fields warning
            setInfoModal({
                show: true,
                title: 'Missing Required Fields',
                message: 'Please fill in all highlighted required fields.'
            });
            return;
        }

        if (!user) {
            setInfoModal({
                show: true,
                title: 'Login Required',
                message: 'Please login first to add this custom order draft to your cart.',
                linkTo: '/login',
                linkText: 'Log In'
            });
            return;
        }

        // Custom validation logic passed, clear validated state if any
        setValidated(true); // Keep it true so greens show
        setShowConfirmModal(true);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);

        const expandedUnitItems = arrangementUnitDetails.map((detail, itemIndex) => {
            const arrangementFlowers = Array.isArray(formData.preferredFlowersByUnit?.[detail.unitKey])
                ? formData.preferredFlowersByUnit[detail.unitKey]
                : [];
            const arrangementOtherFlowersText = String(formData.otherFlowersTextByUnit?.[detail.unitKey] || '').trim();
            const arrangementFlowerLabels = arrangementFlowers.map((flower) => flower?.label).filter(Boolean);
            const selectedColor = formData.colorPreferenceByArrangement?.[detail.value] || '';
            const otherColor = String(formData.otherColorPreferenceByArrangement?.[detail.value] || '').trim();
            const inspirationImageBase64 = formData.inspirationImageByArrangement?.[detail.value] || null;
            const arrangementSelection = {
                arrangement_type: detail.value,
                arrangement_label: detail.label,
                quantity: 1,
                flowers_per_arrangement: detail.flowersPerArrangement || 0,
                total_flowers: detail.flowersPerArrangement || 0,
                estimated_price_min: detail.estimatedPriceMin || 0,
                estimated_price_max: detail.estimatedPriceMax || 0,
                estimated_price_note: detail.estimatedPriceNote || '',
                tentative_subtotal_min: detail.estimatedPriceMin || 0,
                tentative_subtotal_max: detail.estimatedPriceMax || 0,
                preferredFlowers: arrangementFlowerLabels,
                preferred_flowers: arrangementFlowerLabels,
                otherFlowersText: arrangementOtherFlowersText || null,
                other_flowers_text: arrangementOtherFlowersText || null,
                flowers: arrangementFlowerLabels.join(', ') + (arrangementOtherFlowersText ? ` (${arrangementOtherFlowersText})` : ''),
                colorPreference: selectedColor || null,
                color_preference: selectedColor || null,
                rawColorPreference: selectedColor || null,
                raw_color_preference: selectedColor || null,
                otherColorPreference: otherColor || null,
                other_color_preference: otherColor || null,
                inspirationImageBase64,
                inspiration_image_base64: inspirationImageBase64
            };
            const unitLabel = detail.unitLabel || null;
            const itemName = unitLabel ? `${detail.label} - ${unitLabel}` : detail.label;
            const unitTentativeBreakdown = buildTentativeBreakdownFromSelections([{
                arrangementLabel: detail.label,
                quantity: 1,
                estimatedPriceMin: detail.estimatedPriceMin,
                estimatedPriceMax: detail.estimatedPriceMax,
                estimatedPriceNote: detail.estimatedPriceNote,
                tentativeSubtotalMin: detail.estimatedPriceMin,
                tentativeSubtotalMax: detail.estimatedPriceMax,
            }]);
            return {
                id: `${Date.now()}-${detail.value}-${detail.unitIndex}-${itemIndex + 1}`,
                serviceType: 'Custom Order',
                name: itemName,
                title: itemName,
                label: itemName,
                customerName: formData.customerName,
                email: formData.email,
                contactNumber: formData.contactNumber,
                recipientName: formData.recipientName,
                occasion: formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion,
                eventDate: formData.eventDate,
                eventTime: formData.eventTime,
                venue: formData.venue,
                arrangementType: detail.label,
                arrangementSummary: itemName,
                arrangementText: itemName,
                arrangementLabel: detail.label,
                arrangementTypes: [detail.label],
                arrangementTypeValues: [detail.value],
                arrangementQuantities: { [detail.value]: '1' },
                arrangementSelections: [arrangementSelection],
                tentativeBreakdown: unitTentativeBreakdown,
                parent_arrangement_key: detail.value,
                parentArrangementKey: detail.value,
                parent_arrangement_label: detail.label,
                parentArrangementLabel: detail.label,
                unit_key: detail.unitKey,
                unitKey: detail.unitKey,
                unit_index: detail.unitIndex,
                unitIndex: detail.unitIndex,
                unit_count: detail.unitCount,
                unitCount: detail.unitCount,
                unit_label: unitLabel,
                unitLabel,
                arrangementQuantity: 1,
                arrangement_quantity: 1,
                quantity: 1,
                qty: 1,
                flowerQuantity: formData.flowerQuantity || null,
                otherArrangementImageBase64: otherArrangementImagePreview || null,
                totalFlowers: detail.flowersPerArrangement > 0 ? detail.flowersPerArrangement : null,
                total_flower_count: detail.flowersPerArrangement > 0 ? detail.flowersPerArrangement : null,
                customerPreferredFlowers: arrangementFlowerLabels,
                customer_preferred_flowers: arrangementFlowerLabels,
                preferredFlowers: arrangementFlowerLabels,
                preferred_flowers: arrangementFlowerLabels,
                selectedFlowers: arrangementFlowerLabels,
                flowers: arrangementFlowerLabels.join(', ') + (arrangementOtherFlowersText ? ` (${arrangementOtherFlowersText})` : ''),
                otherFlowersText: arrangementOtherFlowersText || null,
                other_flowers_text: arrangementOtherFlowersText || null,
                colorPreference: selectedColor || null,
                specialInstructions: formData.specialInstructions,
                inspirationImageBase64,
                image_url: null,
                requestVariant: 'custom_order_v2',
                custom_order_version: 2,
                flow: 'custom_order_v2',
                price: null,
            };
        });

        // 2. Save to Local Storage
        let currentCart = [];
        const cartKey = `bookingCart_${user?.id || 'guest'}`;
        try {
            const stored = localStorage.getItem(cartKey);
            if (stored) {
                currentCart = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to parse bookingCart from localStorage", e);
        }

        currentCart.push(...expandedUnitItems);
        // Prevent Local Storage Quota Limit by keeping only the 5 most recent Custom Booking drafts
        if (currentCart.length > 5) {
            currentCart = currentCart.slice(-5);
        }

        try {
            localStorage.setItem(cartKey, JSON.stringify(currentCart));
        } catch (e) {
            console.error("Quota Exceeded! Resetting tracking cart forcefully", e);
            localStorage.setItem(cartKey, JSON.stringify(expandedUnitItems.slice(-5))); // Reset with newest items only
        }

        // 3. Clear modal and navigate
        setShowConfirmModal(false);
        setIsSubmitting(false);
        navigate('/cart', { state: { justAdded: 'booking' } });
    };

    return (
        <div style={{ backgroundColor: '#fcfaf8', minHeight: '100vh', paddingTop: '80px', paddingBottom: '60px' }}>
            <style>
                {`
                .hide-valid-indicators.was-validated .form-control:valid, 
                .hide-valid-indicators.was-validated .form-select:valid {
                    border-color: #dee2e6 !important;
                    padding-right: .75rem !important;
                    background-image: none !important;
                }
                `}
            </style>
            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
                linkTo={infoModal.linkTo}
                linkText={infoModal.linkText}
                linkState={infoModal.linkState}
            />
            <div className="container">

                {/* Header Section */}
                <div className="text-center mb-4 mt-4">
                    <div className="d-flex justify-content-center mb-3">
                        <Link
                            to="/custom-order"
                            className="text-decoration-none fw-semibold"
                            style={{ color: 'var(--shop-pink)' }}
                        >
                            <i className="fas fa-arrow-left me-2"></i>Back to arrangement catalogue
                        </Link>
                    </div>
                    <h1 className="display-4 fw-bold font-playfair text-dark">Custom Order Request Form</h1>
                    <p className="lead text-muted mx-auto mb-0" style={{ maxWidth: '700px' }}>
                    Start from a selected arrangement type or build your request from scratch. You can still adjust quantity, flowers, colors, and inspiration details before you add this draft to cart.
                    </p>
                </div>

                {preselectedArrangementOption && (
                    <div
                        className="mx-auto mb-4 p-4"
                        style={{
                            maxWidth: '900px',
                            borderRadius: '24px',
                            background: 'linear-gradient(135deg, rgba(240, 123, 150, 0.12) 0%, rgba(255, 244, 247, 0.96) 100%)',
                            border: '1px solid rgba(240, 123, 150, 0.18)',
                            boxShadow: '0 16px 32px rgba(65, 35, 46, 0.08)'
                        }}
                    >
                        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                            <div className="text-start">
                                <div className="text-uppercase fw-bold small mb-2" style={{ letterSpacing: '0.12em', color: 'var(--shop-pink)' }}>
                                    Selected From Catalogue
                                </div>
                                <h2 className="h4 fw-bold mb-2">{preselectedArrangementOption.label}</h2>
                                <p className="text-muted mb-0">
                                    This arrangement was preselected from the catalogue. You can keep it, add more arrangement types, or fully change the request here.
                                </p>
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                                <span className="badge rounded-pill text-bg-light px-3 py-2">
                                    {preselectedArrangementOption.groupLabel || 'Custom Order'}
                                </span>
                                <span className="badge rounded-pill text-bg-light px-3 py-2">
                                    {preselectedArrangementOption.flowersPerArrangement > 0
                                        ? `${preselectedArrangementOption.flowersPerArrangement} flowers guide`
                                        : 'Custom flower count'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="row justify-content-center">
                    <div className="col-lg-9">
                        <div className="card border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
                            <div className="card-body p-4 p-md-5 bg-white">

                                <form noValidate className={`hide-valid-indicators ${validated ? 'was-validated' : ''}`} onSubmit={triggerValidation}>

                                    {/* SECTION 1: Personal Details */}
                                    <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                                        <i className="fas fa-user-circle me-3 fs-3"></i> Personal Information
                                    </h4>

                                    <div className="row g-4 mb-5">
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Your Full Name <span className="text-danger">*</span></label>
                                            <input type="text" name="customerName" className="form-control bg-light border-0 py-3" value={formData.customerName} onChange={handleChange} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Email Address <span className="text-danger">*</span></label>
                                            <input type="email" name="email" className="form-control bg-light border-0 py-3" value={formData.email} onChange={handleChange} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Contact Number <span className="text-danger">*</span></label>
                                            <input type="tel" name="contactNumber" className="form-control bg-light border-0 py-3" placeholder="e.g., 0917 123 4567" value={formData.contactNumber} onChange={handleChange} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Recipient Full Name <span className="text-danger">*</span></label>
                                            <input type="text" name="recipientName" className="form-control bg-light border-0 py-3" value={formData.recipientName} onChange={handleChange} placeholder="Who will receive this order?" required />
                                        </div>
                                    </div>

                                    <hr className="my-5 text-muted opacity-25" />

                                    {/* SECTION 2: Event Details */}
                                    <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                                        <i className="far fa-calendar-alt me-3 fs-3"></i> Delivery & Event Details
                                    </h4>

                                    <div className="row g-4 mb-5">
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Occasion <span className="text-danger">*</span></label>
                                            <select name="occasion" className="form-select bg-light border-0 py-3" value={formData.occasion} onChange={handleChange} required>
                                                <option value="" disabled>Select Occasion</option>
                                                <option value="Birthday">Birthday</option>
                                                <option value="Wedding">Wedding</option>
                                                <option value="Anniversary">Anniversary</option>
                                                <option value="Graduation">Graduation</option>
                                                <option value="Corporate Event">Corporate Event</option>
                                                <option value="Valentine's Day">Valentine’s Day</option>
                                                <option value="Mother's Day">Mother’s Day</option>
                                                <option value="Sympathy/Funeral">Sympathy/Funeral</option>
                                                <option value="Other">Other</option>
                                            </select>
                                            {formData.occasion === 'Other' && (
                                                <input type="text" name="otherOccasion" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify the occasion" value={formData.otherOccasion} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-12">
                                            <label className="form-label fw-semibold">Event Venue / Location Reference <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                name="venue"
                                                className="form-control bg-light border-0 py-3"
                                                placeholder="Enter the event venue, landmark, or location reference..."
                                                value={formData.venue}
                                                onChange={handleChange}
                                                required
                                            />
                                            <div className="form-text small">
                                                Delivery addresses are chosen during checkout, including multiple addresses if needed.
                                            </div>
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Date Needed <span className="text-danger">*</span></label>
                                            <input
                                                type="date"
                                                name="eventDate"
                                                className={`form-control bg-light border-0 py-3 ${dateError ? 'is-invalid border-danger border-1' : ''}`}
                                                min={minEventDate}
                                                value={formData.eventDate}
                                                onChange={(e) => {
                                                    const date = new Date(e.target.value);
                                                    const day = date.getUTCDay();
                                                    // 0 is Sunday, 6 is Saturday
                                                    if (day === 0 || day === 6) {
                                                        setDateError("Deliveries are only available on Weekdays (Monday to Friday).");
                                                    } else {
                                                        setDateError('');
                                                    }
                                                    handleChange(e);
                                                }}
                                                required
                                            />
                                            {dateError ? (
                                                <div className="invalid-feedback d-block">{dateError}</div>
                                            ) : (
                                                <div className="form-text small">Available Monday - Friday only.</div>
                                            )}
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Preferred Time</label>
                                            <input
                                                type="time"
                                                name="eventTime"
                                                className={`form-control bg-light border-0 py-3 ${timeError ? 'is-invalid border-danger border-1' : ''}`}
                                                value={formData.eventTime}
                                                min={CUSTOM_ORDER_TIME_MIN}
                                                max={CUSTOM_ORDER_TIME_MAX}
                                                onChange={(e) => {
                                                    const timeStr = e.target.value;
                                                    if (timeStr) {
                                                        if (!isWithinBusinessHours(timeStr)) {
                                                            setTimeError(`Our operating hours are from ${BUSINESS_HOURS_LABEL}.`);
                                                        } else {
                                                            setTimeError('');
                                                        }
                                                    } else {
                                                        setTimeError('');
                                                    }
                                                    handleChange(e);
                                                }}
                                            />
                                            {timeError ? (
                                                <div className="invalid-feedback d-block">{timeError}</div>
                                            ) : (
                                                <div className="form-text small">Business hours: {BUSINESS_HOURS_LABEL}.</div>
                                            )}
                                        </div>
                                    </div>

                                    <hr className="my-5 text-muted opacity-25" />

                                    {/* SECTION 3: Floral Preferences */}
                                    <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                                        <i className="fas fa-leaf me-3 fs-3"></i> Floral Specifications
                                    </h4>

                                    <div className="row g-4 mb-4">
                                        <div className="col-12">
                                            <div className="arrangement-builder">
                                                <div className="row g-4 align-items-start">
                                                    <div className="col-12 position-relative">
                                                        <label className="form-label fw-semibold">Arrangement Type <span className="text-danger">*</span></label>
                                                        <Select
                                                            isMulti
                                                            options={catalogArrangementOptions}
                                                            placeholder="Search or select type..."
                                                            onChange={handleArrangementSelect}
                                                            value={flattenedCatalogArrangementOptions.filter((option) => formData.arrangementTypes.includes(option.value))}
                                                            closeMenuOnSelect={false}
                                                            formatOptionLabel={arrangementOptionLabel}
                                                            styles={buildMultiSelectStyles(validated && formData.arrangementTypes.length === 0)}
                                                        />
                                                        <input
                                                            type="text"
                                                            tabIndex={-1}
                                                            style={{ opacity: 0, height: 0, position: 'absolute', bottom: 10, left: 20 }}
                                                            value={formData.arrangementTypes.length > 0 ? 'selected' : ''}
                                                            onChange={() => { }}
                                                            required
                                                        />
                                                        {validated && formData.arrangementTypes.length === 0 && (
                                                            <div className="text-danger small mt-1">Please select at least one arrangement type.</div>
                                                        )}
                                                        <div className="form-text arrangement-helper-text">
                                                            Choose one or more arrangement types, then set the quantity for each selection below.
                                                        </div>
                                                    </div>

                                                    <div className="col-12">
                                                        <label className="form-label fw-semibold">Arrangement Quantities</label>
                                                        {arrangementDetails.length === 0 ? (
                                                            <div className="arrangement-empty-state">
                                                                <div className="arrangement-empty-state__title">No arrangement selected yet</div>
                                                                <div className="arrangement-empty-state__text">Selected arrangement types will appear here as cards so the quantity for each one is easy to adjust.</div>
                                                            </div>
                                                        ) : (
                                                            <div className="arrangement-card-grid">
                                                                {arrangementDetails.map((detail) => (
                                                                    <div key={detail.value} className="arrangement-qty-card">
                                                                        {detail.img && (
                                                                            <button
                                                                                type="button"
                                                                                className="arrangement-qty-card__preview"
                                                                                onClick={() => setArrangementPreviewOption({
                                                                                    img: detail.img,
                                                                                    label: detail.label,
                                                                                    description: detail.description
                                                                                })}
                                                                            >
                                                                                <img src={detail.img} alt={detail.label} className="arrangement-qty-card__preview-image" />
                                                                                <span className="arrangement-qty-card__preview-icon" aria-hidden="true">
                                                                                    <i className="fas fa-expand"></i>
                                                                                </span>
                                                                            </button>
                                                                        )}
                                                                        <div className="arrangement-qty-card__head">
                                                                            <div>
                                                                                <div className="arrangement-qty-card__title">{detail.label}</div>
                                                                                <div className="arrangement-qty-card__meta">
                                                                                    {detail.flowersPerArrangement > 0
                                                                                        ? detail.flowersPerArrangement + ' flowers each'
                                                                                        : 'Custom flower count pending'}
                                                                                </div>
                                                                                {detail.description && (
                                                                                    <div className="arrangement-qty-card__description">{detail.description}</div>
                                                                                )}
                                                                            </div>
                                                                            <div className="arrangement-qty-card__pill">
                                                                                Qty {detail.quantity}
                                                                            </div>
                                                                        </div>

                                                                        <div className="arrangement-stepper">
                                                                            <button
                                                                                type="button"
                                                                                className="arrangement-stepper__button"
                                                                                onClick={() => handleArrangementQuantityStep(detail.value, -1)}
                                                                                aria-label={'Decrease quantity for ' + detail.label}
                                                                            >
                                                                                -
                                                                            </button>
                                                                            <input
                                                                                type="number"
                                                                                className="arrangement-stepper__input"
                                                                                min="1"
                                                                                value={formData.arrangementQuantities?.[detail.value] || '1'}
                                                                                onChange={(e) => handleArrangementQuantityChange(detail.value, e.target.value)}
                                                                                aria-label={'Quantity for ' + detail.label}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                className="arrangement-stepper__button"
                                                                                onClick={() => handleArrangementQuantityStep(detail.value, 1)}
                                                                                aria-label={'Increase quantity for ' + detail.label}
                                                                            >
                                                                                +
                                                                            </button>
                                                                        </div>

                                                                        <div className="arrangement-qty-card__footer">
                                                                            {detail.totalFlowers > 0
                                                                                ? detail.totalFlowers + ' flowers total for this arrangement'
                                                                                : 'Add a flower count for the custom arrangement to estimate the total.'}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-12 mt-3 position-relative">
                                            <label className="form-label fw-semibold">Preferred Flowers Per Arrangement Unit <span className="text-danger">*</span></label>
                                            <div className="d-grid gap-3">
                                                {arrangementDetails.map((detail) => {
                                                    return (
                                                        <div key={`flowers-${detail.value}`} className="arrangement-other-panel">
                                                            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
                                                                <div>
                                                                    <div className="fw-semibold">{detail.label}</div>
                                                                    <div className="text-muted small">
                                                                        {detail.quantity} arrangement{detail.quantity > 1 ? 's' : ''}
                                                                        {detail.flowersPerArrangement > 0 ? ` - ${detail.flowersPerArrangement} flowers each` : ''}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="d-grid gap-3">
                                                                {Array.from({ length: detail.quantity }, (_, unitArrayIndex) => {
                                                                    const unitIndex = unitArrayIndex + 1;
                                                                    const unitKey = buildArrangementUnitKey(detail.value, unitIndex);
                                                                    const selectedUnitFlowers = formData.preferredFlowersByUnit?.[unitKey] || [];
                                                                    const selectedUnitOtherFlowers = formData.otherFlowersTextByUnit?.[unitKey] || '';
                                                                    const hasArrangementFlowerError = validated && selectedUnitFlowers.length === 0;
                                                                    const unitLabel = detail.quantity > 1 ? `Unit ${unitIndex}` : 'Unit 1';

                                                                    return (
                                                                        <div key={unitKey} className="rounded-4 border bg-white p-3">
                                                                            <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-2">
                                                                                <div className="fw-semibold">{unitLabel}</div>
                                                                                <div className="text-muted small">
                                                                                    {detail.flowersPerArrangement > 0
                                                                                        ? `${detail.flowersPerArrangement} flowers guide`
                                                                                        : 'Custom flower count pending'}
                                                                                </div>
                                                                            </div>

                                                                            <Select
                                                                                isMulti
                                                                                options={catalogFlowerOptions}
                                                                                placeholder={`Select flowers for ${detail.label}${detail.quantity > 1 ? ` (${unitLabel})` : ''}...`}
                                                                                onChange={(selectedOptions) => handleArrangementUnitFlowerSelect(detail.value, unitIndex, selectedOptions)}
                                                                                value={selectedUnitFlowers}
                                                                                formatOptionLabel={flowerOptionLabel}
                                                                                styles={buildMultiSelectStyles(hasArrangementFlowerError)}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                tabIndex={-1}
                                                                                style={{ opacity: 0, height: 0, position: 'absolute', left: 0 }}
                                                                                value={selectedUnitFlowers.length > 0 ? 'selected' : ''}
                                                                                onChange={() => { }}
                                                                                required
                                                                            />
                                                                            {hasArrangementFlowerError && (
                                                                                <div className="text-danger small mt-1">Please select at least one preferred flower for this unit.</div>
                                                                            )}

                                                                            <input
                                                                                type="text"
                                                                                className="form-control bg-light border-0 py-3 mt-3"
                                                                                placeholder={`Additional flower notes for ${detail.label}${detail.quantity > 1 ? ` (${unitLabel})` : ''} (optional)`}
                                                                                value={selectedUnitOtherFlowers}
                                                                                onChange={(e) => handleArrangementUnitOtherFlowersChange(detail.value, unitIndex, e.target.value)}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="col-12 mt-3 position-relative">
                                            <label className="form-label fw-semibold">Color Palette Per Arrangement <span className="text-danger">*</span></label>
                                            <div className="d-grid gap-3">
                                                {arrangementDetails.map((detail) => {
                                                    const selectedColor = formData.colorPreferenceByArrangement?.[detail.value] || '';
                                                    const otherColor = formData.otherColorPreferenceByArrangement?.[detail.value] || '';
                                                    const hasColorError = validated && !selectedColor;

                                                    return (
                                                        <div key={`color-${detail.value}`} className="arrangement-other-panel">
                                                            <div className="fw-semibold mb-2">{detail.label}</div>
                                                            <Select
                                                                options={catalogColorOptions}
                                                                formatOptionLabel={customColorOptionLabel}
                                                                placeholder={`Select color palette for ${detail.label}...`}
                                                                onChange={(selectedOption) => handleArrangementColorSelect(detail.value, selectedOption)}
                                                                value={catalogColorOptions.find((option) => option.value === selectedColor) || null}
                                                                isClearable
                                                                styles={{
                                                                    control: (base) => ({
                                                                        ...base,
                                                                        border: hasColorError ? '1px solid #dc3545' : '0',
                                                                        backgroundColor: '#f8f9fa',
                                                                        padding: '6px',
                                                                        borderRadius: '8px',
                                                                        boxShadow: 'none'
                                                                    })
                                                                }}
                                                            />
                                                            <input
                                                                type="text"
                                                                tabIndex={-1}
                                                                style={{ opacity: 0, height: 0, position: 'absolute', left: 0 }}
                                                                value={selectedColor || ''}
                                                                onChange={() => { }}
                                                                required
                                                            />
                                                            {hasColorError && (
                                                                <div className="text-danger small mt-1">Please select a color theme for this arrangement.</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="col-12 mt-4">
                                            <label className="form-label fw-semibold">Special Instructions <span className="text-danger">*</span></label>
                                            <textarea name="specialInstructions" className="form-control bg-light border-0 py-3" rows="5" placeholder="Include any specific directions, themes, budgets, or other details you'd like us to know..." value={formData.specialInstructions} onChange={handleChange} required></textarea>
                                        </div>

                                        <div className="col-12 mt-4">
                                            <label className="form-label fw-semibold d-block">Inspiration Photo Per Arrangement (Optional)</label>
                                            <span className="text-muted small d-block mb-3">Upload a separate reference photo for each selected arrangement (JPG or PNG, max 5MB).</span>

                                            <div className="d-grid gap-3">
                                                {arrangementDetails.map((detail) => {
                                                    const inspirationPreview = formData.inspirationImageByArrangement?.[detail.value] || null;
                                                    const inspirationError = inspirationImageErrorsByArrangement?.[detail.value] || '';

                                                    return (
                                                        <div key={`inspiration-${detail.value}`} className="arrangement-other-panel">
                                                            <div className="fw-semibold mb-2">{detail.label}</div>
                                                            {inspirationPreview ? (
                                                                <div className="position-relative d-inline-block">
                                                                    <img
                                                                        src={inspirationPreview}
                                                                        alt={`${detail.label} inspiration preview`}
                                                                        className="rounded-3 border shadow-sm"
                                                                        style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                                                                        onClick={() => setArrangementPreviewOption({
                                                                            img: inspirationPreview,
                                                                            label: `${detail.label} Inspiration Photo`,
                                                                            description: 'Arrangement-specific inspiration reference'
                                                                        })}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 rounded-circle"
                                                                        onClick={() => removeArrangementInspirationImage(detail.value)}
                                                                        style={{ width: '32px', height: '32px', padding: 0 }}
                                                                    >
                                                                        <i className="fas fa-times"></i>
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <label className="p-4 text-center bg-light rounded-4 border d-block" style={{ borderStyle: 'dashed', cursor: 'pointer' }}>
                                                                    <i className="fas fa-cloud-upload-alt fs-3 text-muted mb-3"></i>
                                                                    <p className="mb-0 fw-semibold">Upload image for {detail.label}</p>
                                                                    <input
                                                                        type="file"
                                                                        className="d-none"
                                                                        accept=".jpg,.jpeg,.png"
                                                                        onChange={(e) => handleArrangementInspirationImageChange(detail.value, e.target.files?.[0])}
                                                                    />
                                                                </label>
                                                            )}
                                                            {inspirationError && <p className="text-danger small mt-2 mb-0"><i className="fas fa-exclamation-circle me-1"></i>{inspirationError}</p>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 pt-4 text-center">
                                        <button
                                            type="submit"
                                            className="btn btn-pink rounded-pill px-5 py-3 fw-bold fs-5 shadow-sm text-white"
                                            style={{ minWidth: '250px' }}
                                            disabled={!!dateError || !!timeError}
                                        >
                            Review Draft <i className="fas fa-arrow-right ms-2"></i>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="modal-overlay" style={{ zIndex: 1060 }} onClick={(e) => { if (e.target === e.currentTarget) setShowConfirmModal(false); }}>
                    <div className="modal-content-custom bg-white p-4" style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="text-center mb-4">
                                <h3 className="fw-bold font-playfair">Confirm Your Draft</h3>
                                <p className="text-muted">Please verify your details before adding this request draft to cart.</p>
                        </div>

                        <div className="bg-light rounded p-3 mb-4 small">
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Your Name:</span>
                                <span className="fw-semibold text-end">{formData.customerName}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Email:</span>
                                <span className="fw-semibold text-end">{formData.email}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Contact:</span>
                                <span className="fw-semibold text-end">{formData.contactNumber}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Recipient:</span>
                                <span className="fw-semibold text-end">{formData.recipientName || '—'}</span>
                            </div>
                            <hr className="my-2" />
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Occasion:</span>
                                <span className="fw-semibold text-end">{formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Event Venue:</span>
                                <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>{formData.venue}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Date Needed:</span>
                                <span className="fw-semibold text-end">{formData.eventDate}</span>
                            </div>
                            {formData.eventTime && (
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Preferred Time:</span>
                                    <span className="fw-semibold text-end">{formData.eventTime}</span>
                                </div>
                            )}
                            <hr className="my-2" />
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Arrangement:</span>
                                <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>{arrangementSummary || 'N/A'}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Total Quantity:</span>
                                <span className="fw-semibold text-end">{totalArrangementQuantity || 1}</span>
                            </div>
                            <div className="mt-3 pt-2 border-top">
                                <span className="text-muted d-block mb-2">Tentative Breakdown:</span>
                                <div className="d-grid gap-2">
                                    {tentativeBreakdown.lineItems.map((lineItem) => (
                                        <div key={lineItem.key} className="border rounded-3 bg-white px-3 py-2">
                                            <div className="d-flex justify-content-between gap-3">
                                                <span className="fw-semibold">{lineItem.label} x{lineItem.quantity}</span>
                                                <span className="fw-semibold text-end">{lineItem.formattedLineRange}</span>
                                            </div>
                                            {lineItem.hasEstimate ? (
                                                <div className="text-muted small mt-1">
                                                    Each: {lineItem.formattedUnitRange}
                                                </div>
                                            ) : (
                                                <div className="text-muted small mt-1">
                                                    Tentative pricing will be confirmed after review.
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="d-flex justify-content-between mt-3">
                                    <span className="text-muted">Tentative Subtotal:</span>
                                    <span className="fw-semibold text-end">
                                        {tentativeBreakdown.hasCompleteEstimate ? tentativeBreakdown.formattedSubtotalRange : 'To be quoted'}
                                    </span>
                                </div>
                                <div className="text-muted small mt-2">
                                    Final price may change after review and confirmation.
                                </div>
                            </div>
                            {otherArrangementImagePreview && (
                                <div className="mt-2 text-center">
                                    <span className="text-muted d-block mb-1">Arrangement Reference:</span>
                                    <img src={otherArrangementImagePreview} alt="Arrangement reference" className="rounded-3 border" style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'cover' }} />
                                </div>
                            )}
                            {arrangementUnitDetails.map((detail) => {
                                const arrangementFlowers = formData.preferredFlowersByUnit?.[detail.unitKey] || [];
                                const arrangementOtherFlowers = formData.otherFlowersTextByUnit?.[detail.unitKey] || '';
                                if (!arrangementFlowers.length) return null;

                                return (
                                    <div key={`summary-flowers-${detail.unitKey}`} className="d-flex justify-content-between mb-2">
                                        <span className="text-muted">
                                            {detail.label}
                                            {detail.unitLabel ? ` (${detail.unitLabel})` : ''} Flowers:
                                        </span>
                                        <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>
                                            {arrangementFlowers.map((flower) => flower.label).join(', ')}
                                            {arrangementOtherFlowers ? ` (${arrangementOtherFlowers})` : ''}
                                        </span>
                                    </div>
                                );
                            })}
                            {arrangementDetails.map((detail) => {
                                const selectedColor = formData.colorPreferenceByArrangement?.[detail.value] || '';
                                const otherColor = formData.otherColorPreferenceByArrangement?.[detail.value] || '';
                                if (!selectedColor) return null;

                                return (
                                    <div key={`summary-color-${detail.value}`} className="d-flex justify-content-between mb-2">
                                        <span className="text-muted">{detail.label} Color:</span>
                                        <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>
                                            {selectedColor}
                                        </span>
                                    </div>
                                );
                            })}
                            {formData.specialInstructions && (
                                <div className="mb-2">
                                    <span className="text-muted d-block mb-1">Special Instructions:</span>
                                    <span className="fw-semibold" style={{ whiteSpace: 'pre-line' }}>{formData.specialInstructions}</span>
                                </div>
                            )}
                            {arrangementDetails.map((detail) => {
                                const inspirationPreview = formData.inspirationImageByArrangement?.[detail.value] || null;
                                if (!inspirationPreview) return null;

                                return (
                                    <div key={`summary-inspiration-${detail.value}`} className="mt-2 text-center">
                                        <span className="text-muted d-block mb-1">{detail.label} Inspiration Photo:</span>
                                        <img
                                            src={inspirationPreview}
                                            alt={`${detail.label} inspiration`}
                                            className="rounded-3 border"
                                            style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                            onClick={() => setArrangementPreviewOption({
                                                img: inspirationPreview,
                                                label: `${detail.label} Inspiration Photo`,
                                                description: 'Arrangement-specific inspiration reference'
                                            })}
                                            title="Click to zoom"
                                        />
                                        <p className="text-muted small mt-1 mb-0"><i className="fas fa-search-plus me-1"></i>Click image to zoom</p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="d-flex gap-3">
                            <button className="btn btn-light flex-grow-1 py-2 fw-semibold" onClick={() => setShowConfirmModal(false)} disabled={isSubmitting}>Edit Details</button>
                                <button className="btn btn-pink flex-grow-1 py-2 fw-semibold shadow-sm" onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                                    Add to Cart
                                </button>
                        </div>
                    </div>
                </div>
            )}

            {arrangementPreviewOption && (
                <div
                    className="modal-overlay"
                    style={{ zIndex: 1075, cursor: 'pointer' }}
                    onClick={() => setArrangementPreviewOption(null)}
                >
                    <div className="arrangement-preview-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="arrangement-preview-modal__close"
                            onClick={() => setArrangementPreviewOption(null)}
                            aria-label="Close arrangement preview"
                        >
                            <i className="fas fa-times" aria-hidden="true"></i>
                        </button>
                        <img
                            src={arrangementPreviewOption.img}
                            alt={arrangementPreviewOption.label}
                            className="arrangement-preview-modal__image"
                        />
                        <div className="arrangement-preview-modal__body">
                            <div className="arrangement-preview-modal__title">{arrangementPreviewOption.label}</div>
                            <div className="arrangement-preview-modal__description">{arrangementPreviewOption.description}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomOrder;
