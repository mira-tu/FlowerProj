import React from 'react';

const previewContainerStyle = (size) => ({
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
});

const getFlowerPlacement = (index, count) => {
  if (count <= 1) {
    return {
      left: '50%',
      top: '14%',
      width: '46%',
      transform: 'translateX(-50%) rotate(-4deg)',
    };
  }

  if (index === 0) {
    return {
      left: '34%',
      top: '16%',
      width: '40%',
      transform: 'translateX(-50%) rotate(-10deg)',
    };
  }

  return {
    left: '64%',
    top: '10%',
    width: '40%',
    transform: 'translateX(-50%) rotate(10deg)',
  };
};

const CustomizedBouquetPreview = ({ item, size = 96 }) => {
  const wrapperSrc = item?.wrapper?.layerImg || item?.wrapper?.img || null;
  const ribbonSrc = item?.ribbon?.layerImg || item?.ribbon?.img || null;
  const flowers = (Array.isArray(item?.flowers) ? item.flowers : [])
    .filter(Boolean)
    .slice(0, 2);
  const fallbackImage = item?.image || null;
  const hasLayeredPreview = Boolean(wrapperSrc || ribbonSrc || flowers.some((flower) => flower?.stemImg || flower?.layerImg || flower?.img));

  if (!hasLayeredPreview && fallbackImage) {
    return (
      <div style={previewContainerStyle(size)}>
        <img
          src={fallbackImage}
          alt={item?.name || 'Customizer Studio bouquet'}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }

  return (
    <div style={previewContainerStyle(size)}>
      {wrapperSrc ? (
        <img
          src={wrapperSrc}
          alt="Wrapper preview"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '-2%',
            width: '88%',
            maxHeight: '96%',
            objectFit: 'contain',
            transform: 'translateX(-50%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {flowers.map((flower, index) => {
        const src = flower?.stemImg || flower?.layerImg || flower?.img;
        if (!src) return null;
        const placement = getFlowerPlacement(index, flowers.length);

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
              maxHeight: '66%',
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
            top: '60%',
            width: '34%',
            transform: 'translate(-50%, -50%)',
            zIndex: 6,
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {!wrapperSrc && !ribbonSrc && flowers.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>
          Preview
        </div>
      ) : null}
    </div>
  );
};

export default CustomizedBouquetPreview;

