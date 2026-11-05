//! Reserve-battery telemetry from the board ADC.

use esp_idf_svc::hal::adc::oneshot::{AdcChannelDriver, AdcDriver};
use esp_idf_svc::hal::adc::AdcChannel;
use guardian_core::error::{Error, Result};
use guardian_device::ports::PowerSampler;
use guardian_protocol::envelope::{Power, PowerSource};

const SAMPLES: u32 = 16;

/// Calibrated ADC channel behind the board battery divider.
pub type BatteryChannel<C> =
    AdcChannelDriver<'static, C, AdcDriver<'static, <C as AdcChannel>::AdcUnit>>;

/// Production reserve-rail sampler.
pub struct AdcPowerSampler<C: AdcChannel> {
    battery: BatteryChannel<C>,
    divider_x1000: u32,
}

impl<C: AdcChannel> AdcPowerSampler<C> {
    /// Build a sampler for a divider ratio expressed as `ratio * 1000`.
    #[must_use]
    pub const fn new(battery: BatteryChannel<C>, divider_x1000: u32) -> Self {
        Self {
            battery,
            divider_x1000,
        }
    }
}

impl<C: AdcChannel> PowerSampler for AdcPowerSampler<C> {
    fn sample_power(&mut self) -> Result<Power> {
        let mut sum = 0u32;
        for _ in 0..SAMPLES {
            sum = sum
                .checked_add(u32::from(self.battery.read().map_err(|_| Error::Io)?))
                .ok_or(Error::State)?;
        }
        let millivolts = sum / SAMPLES * self.divider_x1000 / 1000;
        let reserve = u16::try_from(millivolts).map_err(|_| Error::State)?;
        Power::new(0, Some(reserve), PowerSource::Reserve).map_err(|_| Error::State)
    }
}
