package com.smarttraffic.violation.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrafficCheckRequest {

    @NotBlank(message = "Vehicle ID must not be empty")
    private String vehicleId;

    @NotNull(message = "Speed is required")
    @Min(value = 1, message = "Speed must be greater than 0")
    private Integer speed;

    @NotBlank(message = "Zone must not be empty")
    private String zone;

    @NotNull(message = "Emergency flag is required")
    private Boolean isEmergency;
}
