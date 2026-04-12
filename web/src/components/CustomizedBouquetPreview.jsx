import React, { useMemo, useState } from 'react';

const previewContainerStyle = (size, zoomable = false) => ({
  width: size,
  height: size,
  minWidth: size,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: zoomable ? 'zoom-in' : 'default',
});

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const toPercent = (ratio) => `${Math.max(0, Math.min(1, Number(ratio) || 0)) * 100}%`;

const normalizePreviewComposition = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const stems = Array.isArray(value.stems)
    ? value.stems.filter((stem) => stem?.src)
    : [];

  if (!value.wrapper && !value.ribbon && stems.length === 0) {
    return null;
  }

  return {
    wrapper: value.wrapper?.src ? value.wrapper : null,
    ribbon: value.ribbon?.src ? value.ribbon : null,
    stems,
  };
};

const buildPreviewFlowers = (flowers = [], bundleSize = 0) => {
  const safeFlowers = (Array.isArray(flowers) ? flowers : []).filter(Boolean);
  if (!safeFlowers.length) {
    return [];
  }

  const targetCount = Math.max(
    safeFlowers.length,
    Math.min(4, Math.max(1, Number.parseInt(bundleSize, 10) || safeFlowers.length))
  );

  return Array.from({ length: targetCount }, (_, index) => safeFlowers[index % safeFlowers.length]);
};

const getFlowerPlacements = (count) => {
  if (count <= 1) {
    return [
      {
        left: '50%',
        top: '16%',
        width: '30%',
        transform: 'translateX(-50%) rotate(-3deg)',
      },
    ];
  }

  if (count === 2) {
    return [
      {
        left: '38%',
        top: '18%',
        width: '28%',
        transform: 'translateX(-50%) rotate(-10deg)',
      },
      {
        left: '62%',
        top: '14%',
        width: '28%',
        transform: 'translateX(-50%) rotate(9deg)',
      },
    ];
  }

  if (count === 3) {
    return [
      {
        left: '50%',
        top: '8%',
        width: '28%',
        transform: 'translateX(-50%) rotate(-1deg)',
      },
      {
        left: '34%',
        top: '22%',
        width: '24%',
        transform: 'translateX(-50%) rotate(-11deg)',
      },
      {
        left: '66%',
        top: '20%',
        width: '24%',
        transform: 'translateX(-50%) rotate(11deg)',
      },
    ];
  }

  return [
    {
      left: '50%',
      top: '6%',
      width: '26%',
      transform: 'translateX(-50%) rotate(-1deg)',
    },
    {
      left: '30%',
      top: '18%',
      width: '23%',
      transform: 'translateX(-50%) rotate(-13deg)',
    },
    {
      left: '70%',
      top: '18%',
      width: '23%',
      transform: 'translateX(-50%) rotate(13deg)',
    },
    {
      left: '50%',
      top: '26%',
      width: '22%',
      transform: 'translateX(-50%) rotate(2deg)',
    },
  ];
};

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 1300,
};

const modalCardStyle = {
  position: 'relative',
  background: '#ffffff',
  borderRadius: 20,
  padding: 18,
  boxShadow: '0 24px 70px rgba(15, 23, 42, 0.35)',
};

const closeButtonStyle = {
  position: 'absolute',
  top: 10,
  right: 10,
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(15, 23, 42, 0.08)',
  color: '#1f2937',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
};

const CustomizedBouquetPreview = ({ item, size = 96, zoomable = false }) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const wrapperSrc = item?.wrapper?.layerImg || item?.wrapper?.img || null;
  const ribbonSrc = item?.ribbon?.layerImg || item?.ribbon?.img || null;
  const snapshotSrc = item?.image || item?.image_url || null;
  const wrapperName = item?.wrapper?.groupName
    || item?.wrapper?.wrapper_group_name
    || item?.wrapper?.name
    || '';
  const isClassicWrapper = normalizeText(wrapperName).includes('classic wrap');
  const savedPreviewComposition = useMemo(
    () => normalizePreviewComposition(item?.previewComposition || item?.preview_composition),
    [item?.previewComposition, item?.preview_composition]
  );

  const previewFlowers = useMemo(
    () => buildPreviewFlowers(item?.flowers, item?.bundleSize),
    [item?.flowers, item?.bundleSize]
  );

  const flowerPlacements = useMemo(
    () => getFlowerPlacements(previewFlowers.length),
    [previewFlowers.length]
  );

  const hasSavedComposition = Boolean(savedPreviewComposition);

  const renderSavedCompositionPreview = (renderSize) => (
    <div style={previewContainerStyle(renderSize, zoomable)}>
      {savedPreviewComposition?.wrapper ? (
        <img
          src={savedPreviewComposition.wrapper.src}
          alt="Wrapper preview"
          style={{
            position: 'absolute',
            left: toPercent(savedPreviewComposition.wrapper.leftRatio),
            top: toPercent(savedPreviewComposition.wrapper.topRatio),
            width: toPercent(savedPreviewComposition.wrapper.widthRatio),
            height: toPercent(savedPreviewComposition.wrapper.heightRatio),
            objectFit: 'contain',
            zIndex: savedPreviewComposition.wrapper.zIndex || 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {savedPreviewComposition?.stems?.map((stem) => (
        <div
          key={stem.id}
          style={{
            position: 'absolute',
            left: toPercent(stem.leftRatio),
            top: toPercent(stem.topRatio),
            width: toPercent(stem.widthRatio),
            height: toPercent(stem.heightRatio),
            zIndex: stem.zIndex || 2,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              transform: `rotate(${Number(stem.rotation || 0)}deg) scale(${Number(stem.scale || 1)})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
            }}
          >
            <img
              src={stem.src}
              alt="Flower preview"
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
            />
          </div>
        </div>
      ))}

      {savedPreviewComposition?.ribbon ? (
        <img
          src={savedPreviewComposition.ribbon.src}
          alt="Ribbon preview"
          style={{
            position: 'absolute',
            left: toPercent(savedPreviewComposition.ribbon.leftRatio),
            top: toPercent(savedPreviewComposition.ribbon.topRatio),
            width: toPercent(savedPreviewComposition.ribbon.widthRatio),
            height: toPercent(savedPreviewComposition.ribbon.heightRatio),
            objectFit: 'contain',
            zIndex: savedPreviewComposition.ribbon.zIndex || 8,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );

  const renderLayeredPreview = (renderSize) => (
    <div style={previewContainerStyle(renderSize, zoomable)}>
      {wrapperSrc ? (
        <img
          src={wrapperSrc}
          alt="Wrapper preview"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '-2%',
            width: '90%',
            maxHeight: '94%',
            objectFit: 'contain',
            transform: 'translateX(-50%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {previewFlowers.map((flower, index) => {
        const src = flower?.stemImg || flower?.layerImg || flower?.img;
        if (!src) return null;
        const placement = flowerPlacements[index] || flowerPlacements[flowerPlacements.length - 1];

        return (
          <img
            key={`${flower?.id || flower?.name || index}-${index}`}
            src={src}
            alt={flower?.name || 'Flower preview'}
            style={{
              position: 'absolute',
              ...placement,
              zIndex: 2 + index,
              objectFit: 'contain',
              maxHeight: renderSize === size ? '58%' : '64%',
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {ribbonSrc ? (
        <img
          src={ribbonSrc}
          alt="Ribbon preview"
          style={{
            position: 'absolute',
            left: '50%',
            top: '61%',
            width: renderSize === size ? '28%' : '24%',
            transform: 'translate(-50%, -50%)',
            zIndex: 8,
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {!wrapperSrc && !ribbonSrc && previewFlowers.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>
          Preview
        </div>
      ) : null}
    </div>
  );

  const renderSnapshotPreview = (renderSize) => (
    <div style={previewContainerStyle(renderSize, zoomable)}>
      <img
        src={snapshotSrc}
        alt={item?.name || 'Customizer Studio bouquet'}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );

  const renderPreview = (renderSize) => {
    if (isClassicWrapper && snapshotSrc) {
      return renderSnapshotPreview(renderSize);
    }

    if (hasSavedComposition) {
      return renderSavedCompositionPreview(renderSize);
    }

    if (snapshotSrc) {
      return renderSnapshotPreview(renderSize);
    }

    return renderLayeredPreview(renderSize);
  };

  return (
    <>
      {zoomable ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsPreviewOpen(true);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          style={{
            padding: 0,
            border: 'none',
            background: 'transparent',
            display: 'inline-flex',
          }}
          aria-label="Open bouquet preview"
        >
          {renderPreview(size)}
        </button>
      ) : (
        renderPreview(size)
      )}

      {zoomable && isPreviewOpen && (
        <div
          style={overlayStyle}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsPreviewOpen(false);
          }}
        >
          <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsPreviewOpen(false);
              }}
              style={closeButtonStyle}
              aria-label="Close preview"
            >
              x
            </button>
            {isClassicWrapper && snapshotSrc
              ? renderSnapshotPreview('min(82vw, 360px)')
              : hasSavedComposition
              ? renderSavedCompositionPreview('min(82vw, 360px)')
              : snapshotSrc
              ? renderSnapshotPreview('min(82vw, 360px)')
              : renderLayeredPreview('min(82vw, 360px)')}
          </div>
        </div>
      )}
    </>
  );
};

export default CustomizedBouquetPreview;
